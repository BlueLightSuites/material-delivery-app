import React, { useState } from 'react';
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
import { MainStackParamList } from '../../navigation/MainNavigator';

type NewRequestNavigationProp = StackNavigationProp<MainStackParamList, 'NewRequest'>;

interface NewRequestProps {
  navigation: NewRequestNavigationProp;
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

const NewRequest: React.FC<NewRequestProps> = ({ navigation }) => {
  const [currentStep, setCurrentStep] = useState<'location' | 'material' | 'vehicle' | 'review'>(
    'location'
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

  const handleSubmit = async () => {
    setLoading(true);
    try {
      // TODO: Send request to backend
      console.log('Submitting delivery request:', form);
      Alert.alert('Success', 'Delivery request submitted successfully!', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to submit request. Please try again.');
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

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {getStepIndicator()}

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
                <Text style={styles.stepTitle}>Review Your Request</Text>
                <Text style={styles.stepDescription}>
                  Please review all details before submitting
                </Text>

                <View style={styles.reviewCard}>
                  <Text style={styles.reviewSectionTitle}>📍 Locations</Text>
                  <View style={styles.reviewItem}>
                    <Text style={styles.reviewLabel}>Pickup:</Text>
                    <Text style={styles.reviewValue}>{form.pickupAddress}</Text>
                  </View>
                  <View style={styles.reviewItem}>
                    <Text style={styles.reviewLabel}>Drop-off:</Text>
                    <Text style={styles.reviewValue}>{form.dropoffAddress}</Text>
                  </View>
                </View>

                <View style={styles.reviewCard}>
                  <Text style={styles.reviewSectionTitle}>📦 Materials</Text>
                  <View style={styles.reviewItem}>
                    <Text style={styles.reviewLabel}>Category:</Text>
                    <Text style={styles.reviewValue}>{form.materialCategory}</Text>
                  </View>
                  <View style={styles.reviewItem}>
                    <Text style={styles.reviewLabel}>Quantity:</Text>
                    <Text style={styles.reviewValue}>
                      {form.materialWeight} {form.materialUnit}
                    </Text>
                  </View>
                </View>

                <View style={styles.reviewCard}>
                  <Text style={styles.reviewSectionTitle}>🚛 Vehicle</Text>
                  <View style={styles.reviewItem}>
                    <Text style={styles.reviewLabel}>Type:</Text>
                    <Text style={styles.reviewValue}>
                      {form.requiresTrailer ? 'Truck with Trailer' : 'Standard Truck'}
                    </Text>
                  </View>
                  {form.additionalNotes && (
                    <View style={styles.reviewItem}>
                      <Text style={styles.reviewLabel}>Notes:</Text>
                      <Text style={styles.reviewValue}>{form.additionalNotes}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>
        </ScrollView>

        <View style={styles.buttonContainer}>
          {currentStep !== 'location' && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleBack}
              disabled={loading}
            >
              <Text style={styles.secondaryButtonText}>Back</Text>
            </TouchableOpacity>
          )}

          {currentStep !== 'review' ? (
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
                <Text style={styles.primaryButtonText}>Submit Request</Text>
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
