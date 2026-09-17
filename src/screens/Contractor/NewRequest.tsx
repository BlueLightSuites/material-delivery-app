import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { MainStackParamList } from '../../navigation/MainNavigator';
import { useAuth } from '../../context/AuthContext';
import {
  createDeliveryRequest,
  updateDeliveryRequest,
  getDeliveryRequestById,
} from '../../services/api/deliveryRequests';
import { geocodeAddress } from '../../services/geolocation';

type NewRequestNavigationProp = StackNavigationProp<MainStackParamList, 'NewRequest'>;
type NewRequestRouteProp = RouteProp<MainStackParamList, 'NewRequest'>;

interface NewRequestProps {
  navigation: NewRequestNavigationProp;
  route: NewRequestRouteProp;
}

interface DeliveryRequest {
  pickupAddress: string;
  dropoffAddress: string;
  materialCategory: string;
  materialWeight: string;
  materialUnit: 'lbs' | 'tons' | 'cubic_yards';
  requiresTrailer: boolean;
  additionalNotes: string;
}

const MATERIAL_CATEGORIES = [
  'Lumber',
  'Drywall',
  'Gravel',
  'Concrete',
  'Steel',
  'Brick/Block',
  'Roofing Materials',
  'Insulation',
  'Flooring',
  'Paint & Coating',
  'Other',
];

const WEIGHT_UNITS = [
  { label: 'lbs', value: 'lbs' },
  { label: 'tons', value: 'tons' },
  { label: 'cubic yards', value: 'cubic_yards' },
];

const NewRequest: React.FC<NewRequestProps> = ({ navigation, route }) => {
  // The same wizard serves both jobs. Editing is only reachable while a
  // request is still pending - the database enforces that too, so a
  // request accepted while this screen was open fails to save rather
  // than silently changing terms a driver already agreed to.
  const editingId = route.params?.requestId;
  const isEditing = !!editingId;
  const [loadingExisting, setLoadingExisting] = useState(isEditing);
  // The request as it currently exists in the database. Everything the
  // summary says about what changed is measured against this, so it must
  // not be updated as the contractor types.
  const [savedForm, setSavedForm] = useState<DeliveryRequest | null>(null);
  const { accessToken, user } = useAuth();
  // Editing opens on the summary: a contractor arriving here wants to
  // see the whole order and change one part of it, not be walked from
  // the beginning. Creating still starts at step one.
  const [currentStep, setCurrentStep] = useState<'location' | 'material' | 'vehicle' | 'review'>(
    route.params?.requestId ? 'review' : 'location'
  );
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<DeliveryRequest>({
    pickupAddress: '',
    dropoffAddress: '',
    materialCategory: '',
    materialWeight: '',
    materialUnit: 'lbs',
    requiresTrailer: false,
    additionalNotes: '',
  });

  useEffect(() => {
    if (!editingId || !accessToken) {
      return;
    }
    let cancelled = false;
    getDeliveryRequestById(accessToken, editingId).then((existing) => {
      if (cancelled) {
        return;
      }
      if (!existing) {
        Alert.alert('Request not found', 'This request may have been removed.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
        return;
      }
      if (existing.status !== 'pending') {
        Alert.alert(
          'Too late to edit',
          'A driver has already accepted this request, so its details are locked.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
        return;
      }
      const loaded: DeliveryRequest = {
        pickupAddress: existing.pickup_address ?? '',
        dropoffAddress: existing.dropoff_address ?? '',
        materialCategory: existing.material_category ?? '',
        materialWeight: existing.material_weight != null ? String(existing.material_weight) : '',
        materialUnit: (existing.material_unit as DeliveryRequest['materialUnit']) ?? 'lbs',
        requiresTrailer: !!existing.requires_trailer,
        additionalNotes: existing.notes ?? '',
      };
      setForm(loaded);
      setSavedForm(loaded);
      setLoadingExisting(false);
    });
    return () => {
      cancelled = true;
    };
  }, [editingId, accessToken, navigation]);

  const handleInputChange = (field: keyof DeliveryRequest, value: string) => {
    setForm({ ...form, [field]: value });
  };

  const validateLocationStep = (): boolean => {
    if (!form.pickupAddress.trim()) {
      Alert.alert('Missing Information', 'Please enter a pickup location');
      return false;
    }
    if (!form.dropoffAddress.trim()) {
      Alert.alert('Missing Information', 'Please enter a drop-off location');
      return false;
    }
    return true;
  };

  const validateMaterialStep = (): boolean => {
    if (!form.materialCategory) {
      Alert.alert('Missing Information', 'Please select a material category');
      return false;
    }
    if (!form.materialWeight.trim()) {
      Alert.alert('Missing Information', 'Please enter the material weight or volume');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (currentStep === 'location' && validateLocationStep()) {
      setCurrentStep('material');
    } else if (currentStep === 'material' && validateMaterialStep()) {
      setCurrentStep('vehicle');
    } else if (currentStep === 'vehicle') {
      setCurrentStep('review');
    }
  };

  const handleBack = () => {
    if (currentStep === 'material') {
      setCurrentStep('location');
    } else if (currentStep === 'vehicle') {
      setCurrentStep('material');
    } else if (currentStep === 'review') {
      setCurrentStep('vehicle');
    }
  };

  const hasFieldChanged = (field: keyof DeliveryRequest): boolean =>
    !!savedForm && form[field] !== savedForm[field];

  /** The saved value of a field, but only when it differs from what's on screen. */
  const previousValue = (field: keyof DeliveryRequest): string | null => {
    if (!hasFieldChanged(field) || !savedForm) {
      return null;
    }
    const value = savedForm[field];
    if (typeof value === 'boolean') {
      return value ? 'Truck with Trailer' : 'Standard Truck';
    }
    return value === '' ? '(empty)' : String(value);
  };

  /** Quantity reads as one value to a contractor even though it's two fields. */
  const previousQuantity = (): string | null => {
    if (!savedForm || (!hasFieldChanged('materialWeight') && !hasFieldChanged('materialUnit'))) {
      return null;
    }
    return `${savedForm.materialWeight} ${savedForm.materialUnit}`;
  };

  const sectionChanged = (fields: (keyof DeliveryRequest)[]): boolean =>
    fields.some(hasFieldChanged);

  const changedCount = savedForm
    ? (Object.keys(form) as (keyof DeliveryRequest)[]).filter(hasFieldChanged).length
    : 0;

  // Returning to the summary validates the section being left, so the
  // summary never shows a blank required field that Save would then
  // bounce the contractor back to.
  const handleDoneEditingSection = () => {
    if (currentStep === 'location' && !validateLocationStep()) {
      return;
    }
    if (currentStep === 'material' && !validateMaterialStep()) {
      return;
    }
    setCurrentStep('review');
  };

  const handleSubmit = async () => {
    // A save from the vehicle step still writes addresses and material,
    // so both sections are validated regardless of which one is visible.
    // Without this, editing could blank a required field from a screen
    // that never shows it.
    if (isEditing) {
      // Jump to the offending section before complaining about it -
      // an alert about a pickup address is baffling while looking at the
      // vehicle step, and leaves no obvious way to act on it.
      if (!validateLocationStep()) {
        setCurrentStep('location');
        return;
      }
      if (!validateMaterialStep()) {
        setCurrentStep('material');
        return;
      }
    }

    setLoading(true);
    try {
      console.log('handleSubmit: Auth context values:', { accessToken: !!accessToken, userId: user?.id });

      if (!accessToken) {
        Alert.alert('Authentication required', 'Please sign in again before submitting a request.');
        setLoading(false);
        return;
      }

      if (!user?.auth_id) {
        Alert.alert('Error', 'User authentication ID missing. Please sign in again.');
        setLoading(false);
        return;
      }

      // Enrichment, not a requirement: a request with a free-text address
      // and no coordinates is still valid, so a geocode miss must not
      // block the submit. It only costs "nearby" filtering on that row.
      const [pickup, dropoff] = await Promise.all([
        geocodeAddress(form.pickupAddress),
        geocodeAddress(form.dropoffAddress),
      ]);

      const payload = {
        auth_id: user.auth_id,
        pickup_address: form.pickupAddress,
        pickup_lat: pickup?.lat,
        pickup_lng: pickup?.lng,
        dropoff_address: form.dropoffAddress,
        dropoff_lat: dropoff?.lat,
        dropoff_lng: dropoff?.lng,
        material_category: form.materialCategory,
        material_weight: Number(form.materialWeight) || 0,
        material_unit: form.materialUnit,
        requires_trailer: form.requiresTrailer,
        notes: form.additionalNotes,
      };

      if (isEditing && editingId) {
        // auth_id is omitted: it never changes, and the update policy
        // matches on it, so sending it back adds nothing but a way to
        // get it wrong.
        const { auth_id: _ignored, ...changes } = payload;
        const updated = await updateDeliveryRequest(accessToken, editingId, changes);

        if (updated) {
          Alert.alert('Saved', 'Your request has been updated.', [
            { text: 'OK', onPress: () => navigation.navigate('RequestList') },
          ]);
        } else {
          // The most likely cause is a driver accepting between opening
          // this screen and saving: the row is no longer pending, so the
          // update policy stops matching it and nothing is written.
          Alert.alert(
            'Could not save',
            'This request may have just been accepted by a driver, which locks its details. Reopen it to see its current state.'
          );
        }
        return;
      }

      const created = await createDeliveryRequest(accessToken, payload);

      if (created) {
        Alert.alert('Success', 'Delivery request submitted successfully!', [
          {
            text: 'OK',
            onPress: () => navigation.navigate('RequestList'),
          },
        ]);
      } else {
        Alert.alert('Error', 'Failed to submit request. Please check your connection and try again.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      console.error('handleSubmit: Error caught:', errorMessage);
      Alert.alert('Error', `Failed to submit request: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const getStepIndicator = () => {
    const steps = [
      { key: 'location', label: 'Location' },
      { key: 'material', label: 'Material' },
      { key: 'vehicle', label: 'Vehicle' },
      { key: 'review', label: 'Review' },
    ];

    return (
      <View style={styles.stepContainer}>
        {steps.map((step, index) => (
          <View key={step.key} style={styles.stepWrapper}>
            <View
              style={[
                styles.stepCircle,
                {
                  backgroundColor:
                    step.key === currentStep
                      ? '#0066CC'
                      : steps.findIndex((s) => s.key === currentStep) > index
                      ? '#0066CC'
                      : '#E0E0E0',
                },
              ]}
            >
              <Text
                style={[
                  styles.stepNumber,
                  {
                    color:
                      step.key === currentStep ||
                      steps.findIndex((s) => s.key === currentStep) > index
                        ? '#FFFFFF'
                        : '#999999',
                  },
                ]}
              >
                {index + 1}
              </Text>
            </View>
            <Text
              style={[
                styles.stepLabel,
                {
                  color:
                    step.key === currentStep
                      ? '#0066CC'
                      : steps.findIndex((s) => s.key === currentStep) > index
                      ? '#0066CC'
                      : '#999999',
                },
              ]}
            >
              {step.label}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  // Without this the wizard renders empty fields for a moment and then
  // fills them in, which reads as data loss on a screen whose whole
  // purpose is editing existing data.
  if (loadingExisting) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0066CC" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Progress dots describe a four-step journey. Editing isn't
              one - the summary is the hub and sections are reached from
              it - so they'd imply a sequence that doesn't apply. */}
          {!isEditing && getStepIndicator()}

          <View style={styles.formContainer}>
            {currentStep === 'location' && (
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Pickup & Drop-off Locations</Text>
                <Text style={styles.stepDescription}>
                  Enter the material supplier address and job site location
                </Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Pickup Location *</Text>
                  <Text style={styles.helperText}>Material supplier address</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter pickup address"
                    placeholderTextColor="#999999"
                    value={form.pickupAddress}
                    onChangeText={(text) => handleInputChange('pickupAddress', text)}
                    multiline
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Drop-off Location *</Text>
                  <Text style={styles.helperText}>Job site address</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter drop-off address"
                    placeholderTextColor="#999999"
                    value={form.dropoffAddress}
                    onChangeText={(text) => handleInputChange('dropoffAddress', text)}
                    multiline
                  />
                </View>

                <View style={styles.noteBox}>
                  <Text style={styles.noteIcon}>📍</Text>
                  <Text style={styles.noteText}>
                    GPS coordinates will be validated during driver matching
                  </Text>
                </View>
              </View>
            )}

            {currentStep === 'material' && (
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Material Details</Text>
                <Text style={styles.stepDescription}>
                  Specify what materials need to be delivered
                </Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Material Category *</Text>
                  <View style={styles.categoryGrid}>
                    {MATERIAL_CATEGORIES.map((category) => (
                      <TouchableOpacity
                        key={category}
                        style={[
                          styles.categoryButton,
                          {
                            backgroundColor:
                              form.materialCategory === category ? '#0066CC' : '#F5F5F5',
                          },
                        ]}
                        onPress={() => handleInputChange('materialCategory', category)}
                      >
                        <Text
                          style={[
                            styles.categoryButtonText,
                            {
                              color:
                                form.materialCategory === category ? '#FFFFFF' : '#1A1A1A',
                            },
                          ]}
                        >
                          {category}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.inputRow}>
                  <View style={[styles.inputGroup, { flex: 2 }]}>
                    <Text style={styles.label}>Weight/Volume *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter amount"
                      placeholderTextColor="#999999"
                      keyboardType="decimal-pad"
                      value={form.materialWeight}
                      onChangeText={(text) => handleInputChange('materialWeight', text)}
                    />
                  </View>

                  <View style={[styles.inputGroup, { flex: 1, marginLeft: 12 }]}>
                    <Text style={styles.label}>Unit</Text>
                    <View style={styles.unitButtonGroup}>
                      {WEIGHT_UNITS.map((unit) => (
                        <TouchableOpacity
                          key={unit.value}
                          style={[
                            styles.unitButton,
                            {
                              backgroundColor:
                                form.materialUnit === unit.value ? '#0066CC' : '#F5F5F5',
                            },
                          ]}
                          onPress={() => handleInputChange('materialUnit', unit.value)}
                        >
                          <Text
                            style={[
                              styles.unitButtonText,
                              {
                                color:
                                  form.materialUnit === unit.value ? '#FFFFFF' : '#666666',
                              },
                            ]}
                          >
                            {unit.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
              </View>
            )}

            {currentStep === 'vehicle' && (
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Vehicle Requirements</Text>
                <Text style={styles.stepDescription}>
                  Specify the type of vehicle needed for delivery
                </Text>

                <View style={styles.vehicleCard}>
                  <View style={styles.vehicleOption}>
                    <View style={styles.vehicleInfo}>
                      <Text style={styles.vehicleIcon}>🚚</Text>
                      <View style={styles.vehicleDetails}>
                        <Text style={styles.vehicleTitle}>Standard Truck</Text>
                        <Text style={styles.vehicleDesc}>For lighter materials</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.vehicleOptionWithSwitch}>
                    <View style={styles.vehicleInfo}>
                      <Text style={styles.vehicleIcon}>🚛</Text>
                      <View style={styles.vehicleDetails}>
                        <Text style={styles.vehicleTitle}>Truck with Trailer</Text>
                        <Text style={styles.vehicleDesc}>For heavier loads</Text>
                      </View>
                    </View>
                    <Switch
                      style={styles.switch}
                      value={form.requiresTrailer}
                      onValueChange={(value) =>
                        setForm({ ...form, requiresTrailer: value })
                      }
                      trackColor={{ false: '#E0E0E0', true: '#B3D9FF' }}
                      thumbColor={form.requiresTrailer ? '#0066CC' : '#FFFFFF'}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Additional Notes</Text>
                  <Text style={styles.helperText}>Special handling or access instructions</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="e.g., 'Loading dock available', 'Stairs access only'"
                    placeholderTextColor="#999999"
                    multiline
                    numberOfLines={4}
                    value={form.additionalNotes}
                    onChangeText={(text) => handleInputChange('additionalNotes', text)}
                  />
                </View>
              </View>
            )}

            {currentStep === 'review' && (
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>
                  {isEditing ? 'Your Request' : 'Review Your Request'}
                </Text>
                <Text style={styles.stepDescription}>
                  {isEditing
                    ? 'Tap Edit on any section to change it, then save.'
                    : 'Please review all details before submitting'}
                </Text>

                {isEditing && changedCount > 0 && (
                  <View style={styles.changeBanner}>
                    <Text style={styles.changeBannerText}>
                      {changedCount} unsaved {changedCount === 1 ? 'change' : 'changes'}. Previous
                      values are shown below each edit.
                    </Text>
                  </View>
                )}

                <View style={styles.reviewCard}>
                  <View style={styles.reviewCardHeader}>
                    <View style={styles.reviewTitleRow}>
                      <Text style={styles.reviewSectionTitle}>📍 Locations</Text>
                      {isEditing && sectionChanged(['pickupAddress', 'dropoffAddress']) && (
                        <View style={styles.changedBadge}>
                          <Text style={styles.changedBadgeText}>Changed</Text>
                        </View>
                      )}
                    </View>
                    <TouchableOpacity onPress={() => setCurrentStep('location')}>
                      <Text style={styles.reviewEditLink}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.reviewItem}>
                    <Text style={styles.reviewLabel}>Pickup:</Text>
                    <Text style={styles.reviewValue}>{form.pickupAddress}</Text>
                    {isEditing && previousValue('pickupAddress') && (
                      <Text style={styles.reviewWas}>was {previousValue('pickupAddress')}</Text>
                    )}
                  </View>
                  <View style={styles.reviewItem}>
                    <Text style={styles.reviewLabel}>Drop-off:</Text>
                    <Text style={styles.reviewValue}>{form.dropoffAddress}</Text>
                    {isEditing && previousValue('dropoffAddress') && (
                      <Text style={styles.reviewWas}>was {previousValue('dropoffAddress')}</Text>
                    )}
                  </View>
                </View>

                <View style={styles.reviewCard}>
                  <View style={styles.reviewCardHeader}>
                    <View style={styles.reviewTitleRow}>
                      <Text style={styles.reviewSectionTitle}>📦 Materials</Text>
                      {isEditing && sectionChanged(['materialCategory', 'materialWeight', 'materialUnit']) && (
                        <View style={styles.changedBadge}>
                          <Text style={styles.changedBadgeText}>Changed</Text>
                        </View>
                      )}
                    </View>
                    <TouchableOpacity onPress={() => setCurrentStep('material')}>
                      <Text style={styles.reviewEditLink}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.reviewItem}>
                    <Text style={styles.reviewLabel}>Category:</Text>
                    <Text style={styles.reviewValue}>{form.materialCategory}</Text>
                    {isEditing && previousValue('materialCategory') && (
                      <Text style={styles.reviewWas}>was {previousValue('materialCategory')}</Text>
                    )}
                  </View>
                  <View style={styles.reviewItem}>
                    <Text style={styles.reviewLabel}>Quantity:</Text>
                    <Text style={styles.reviewValue}>
                      {form.materialWeight} {form.materialUnit}
                    </Text>
                    {isEditing && previousQuantity() && (
                      <Text style={styles.reviewWas}>was {previousQuantity()}</Text>
                    )}
                  </View>
                </View>

                <View style={styles.reviewCard}>
                  <View style={styles.reviewCardHeader}>
                    <View style={styles.reviewTitleRow}>
                      <Text style={styles.reviewSectionTitle}>🚛 Vehicle</Text>
                      {isEditing && sectionChanged(['requiresTrailer', 'additionalNotes']) && (
                        <View style={styles.changedBadge}>
                          <Text style={styles.changedBadgeText}>Changed</Text>
                        </View>
                      )}
                    </View>
                    <TouchableOpacity onPress={() => setCurrentStep('vehicle')}>
                      <Text style={styles.reviewEditLink}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.reviewItem}>
                    <Text style={styles.reviewLabel}>Type:</Text>
                    <Text style={styles.reviewValue}>
                      {form.requiresTrailer ? 'Truck with Trailer' : 'Standard Truck'}
                    </Text>
                    {isEditing && previousValue('requiresTrailer') && (
                      <Text style={styles.reviewWas}>was {previousValue('requiresTrailer')}</Text>
                    )}
                  </View>
                  {form.additionalNotes && (
                    <View style={styles.reviewItem}>
                      <Text style={styles.reviewLabel}>Notes:</Text>
                      <Text style={styles.reviewValue}>{form.additionalNotes}</Text>
                      {isEditing && previousValue('additionalNotes') && (
                        <Text style={styles.reviewWas}>was {previousValue('additionalNotes')}</Text>
                      )}
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>
        </ScrollView>

        <View style={styles.buttonContainer}>
          {!isEditing && currentStep !== 'location' && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleBack}
              disabled={loading}
            >
              <Text style={styles.secondaryButtonText}>Back</Text>
            </TouchableOpacity>
          )}

          {isEditing ? (
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { flex: 1 },
                currentStep === 'review' && changedCount === 0 && styles.primaryButtonDisabled,
              ]}
              onPress={currentStep === 'review' ? handleSubmit : handleDoneEditingSection}
              disabled={loading || (currentStep === 'review' && changedCount === 0)}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {currentStep === 'review' ? 'Save Changes' : 'Done'}
                </Text>
              )}
            </TouchableOpacity>
          ) : currentStep !== 'review' ? (
            <TouchableOpacity
              style={[styles.primaryButton, { flex: currentStep === 'location' ? 1 : 0.5 }]}
              onPress={handleNext}
              disabled={loading}
            >
              <Text style={styles.primaryButtonText}>Next</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primaryButton, { flex: 0.5 }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {isEditing ? 'Save Changes' : 'Submit Request'}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  stepContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  stepWrapper: {
    alignItems: 'center',
    flex: 1,
  },
  stepCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  stepNumber: {
    fontSize: 16,
    fontWeight: '600',
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  formContainer: {
    marginBottom: 100,
  },
  stepContent: {
    marginBottom: 20,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 6,
  },
  helperText: {
    fontSize: 12,
    color: '#999999',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1A1A1A',
    backgroundColor: '#FAFAFA',
  },
  textArea: {
    textAlignVertical: 'top',
    minHeight: 100,
    paddingTop: 12,
  },
  noteBox: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  noteIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  noteText: {
    fontSize: 12,
    color: '#0066CC',
    flex: 1,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 8,
  },
  categoryButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  unitButtonGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  unitButton: {
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  unitButtonText: {
    fontSize: 11,
    fontWeight: '500',
  },
  vehicleCard: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
  },
  vehicleOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  vehicleOptionWithSwitch: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  vehicleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  vehicleIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  vehicleDetails: {
    flex: 1,
  },
  vehicleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  vehicleDesc: {
    fontSize: 12,
    color: '#999999',
  },
  switch: {
    marginLeft: 16,
  },
  reviewCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  changeBanner: {
    backgroundColor: '#FFF8E6',
    borderWidth: 1,
    borderColor: '#E3B25C',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  changeBannerText: {
    fontSize: 13,
    color: '#7A5A18',
    lineHeight: 18,
  },
  reviewTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  changedBadge: {
    backgroundColor: '#FFF3D6',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  changedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7A5A18',
    textTransform: 'uppercase',
  },
  reviewWas: {
    fontSize: 12,
    color: '#999999',
    marginTop: 2,
    textDecorationLine: 'line-through',
  },
  reviewCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reviewEditLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066CC',
  },
  reviewSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  reviewItem: {
    marginBottom: 12,
  },
  reviewLabel: {
    fontSize: 12,
    color: '#999999',
    marginBottom: 2,
  },
  reviewValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 32,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  primaryButton: {
    backgroundColor: '#0066CC',
    paddingVertical: 14,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#B8CFE8',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 0.5,
    backgroundColor: '#F5F5F5',
    paddingVertical: 14,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  secondaryButtonText: {
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default NewRequest;
