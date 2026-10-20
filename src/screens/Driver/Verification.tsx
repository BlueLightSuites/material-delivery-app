import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { MainStackParamList } from '../../navigation/MainNavigator';
import { useAuth } from '../../context/AuthContext';
import {
  getVehicle,
  saveVehicle,
  getDriverDocuments,
  uploadDriverDocument,
  isVerifiedDriver,
  Vehicle,
  VehicleType,
  DocumentType,
  DriverDocument,
} from '../../services/api/driverVerification';

type VerificationNavigationProp = StackNavigationProp<MainStackParamList, 'DriverVerification'>;

interface VerificationProps {
  navigation: VerificationNavigationProp;
}

const VEHICLE_TYPES: { value: VehicleType; label: string; icon: string }[] = [
  { value: 'pickup', label: 'Pickup truck', icon: '🛻' },
  { value: 'flatbed', label: 'Flatbed', icon: '🚚' },
  { value: 'box_truck', label: 'Box truck', icon: '📦' },
  { value: 'dump_truck', label: 'Dump truck', icon: '🚛' },
];

const DOCUMENTS: { type: DocumentType; label: string; hint: string }[] = [
  { type: 'license', label: "Driver's license", hint: 'Front of the card, all four corners visible' },
  { type: 'registration', label: 'Vehicle registration', hint: 'For the vehicle you’ll deliver with' },
  { type: 'insurance', label: 'Proof of insurance', hint: 'Insurance card or declarations page' },
];

const formatDate = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const isExpired = (doc: DriverDocument) =>
  !!doc.expires_on && new Date(`${doc.expires_on}T23:59:59`) < new Date();

/** What a driver needs to know about one document, in one line. */
const describeDocument = (doc: DriverDocument | undefined): { text: string; color: string } => {
  if (!doc) {
    return { text: 'Not uploaded', color: '#999999' };
  }
  if (doc.status === 'approved' && isExpired(doc)) {
    return { text: `Expired ${formatDate(doc.expires_on as string)} — upload a current one`, color: '#C62828' };
  }
  if (doc.status === 'approved') {
    return {
      text: doc.expires_on ? `Approved · expires ${formatDate(doc.expires_on)}` : 'Approved',
      color: '#2E7D32',
    };
  }
  if (doc.status === 'rejected') {
    return {
      text: doc.rejection_reason ? `Rejected: ${doc.rejection_reason}` : 'Rejected — please upload again',
      color: '#C62828',
    };
  }
  return { text: 'In review', color: '#E65100' };
};

const Verification: React.FC<VerificationProps> = () => {
  const { accessToken, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const [documents, setDocuments] = useState<DriverDocument[]>([]);
  const [savedVehicle, setSavedVehicle] = useState<Vehicle | null>(null);
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null);
  const [hasTrailer, setHasTrailer] = useState(false);
  const [trailerCapacity, setTrailerCapacity] = useState('');
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [uploadingType, setUploadingType] = useState<DocumentType | null>(null);

  const authId = user?.auth_id;

  const load = useCallback(async () => {
    if (!accessToken || !authId) {
      return;
    }
    const [vehicle, docs, isVerified] = await Promise.all([
      getVehicle(accessToken, authId),
      getDriverDocuments(accessToken),
      isVerifiedDriver(accessToken),
    ]);
    setSavedVehicle(vehicle);
    setVehicleType(vehicle?.vehicle_type ?? null);
    setHasTrailer(!!vehicle?.has_trailer);
    setTrailerCapacity(vehicle?.trailer_capacity_lbs ? String(vehicle.trailer_capacity_lbs) : '');
    setDocuments(docs);
    setVerified(isVerified);
    setLoading(false);
  }, [accessToken, authId]);

  // On focus rather than mount, so a review that lands while the driver
  // is elsewhere in the app shows up when they come back.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const capacity = parseInt(trailerCapacity, 10);
  const vehicleValid = !!vehicleType && (!hasTrailer || capacity > 0);
  const vehicleDirty =
    vehicleType !== (savedVehicle?.vehicle_type ?? null) ||
    hasTrailer !== !!savedVehicle?.has_trailer ||
    (hasTrailer && capacity !== (savedVehicle?.trailer_capacity_lbs ?? NaN));

  const handleSaveVehicle = async () => {
    if (!accessToken || !authId || !vehicleValid) {
      return;
    }
    setSavingVehicle(true);
    const ok = await saveVehicle(accessToken, authId, {
      vehicle_type: vehicleType,
      has_trailer: hasTrailer,
      trailer_capacity_lbs: hasTrailer ? capacity : null,
    });
    setSavingVehicle(false);
    if (ok) {
      load();
    } else {
      Alert.alert('Couldn’t save', 'Check your connection and try again.');
    }
  };

  const upload = async (docType: DocumentType, source: 'camera' | 'library') => {
    if (!accessToken || !authId) {
      return;
    }
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission needed',
          `Allow ${source === 'camera' ? 'camera' : 'photo library'} access in Settings to upload documents.`
        );
        return;
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        // Enough to read a license number; full resolution would make
        // every upload several megabytes over a phone connection.
        quality: 0.6,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      setUploadingType(docType);
      const submitted = await uploadDriverDocument(accessToken, authId, docType, result.assets[0].uri);
      if (submitted) {
        load();
      } else {
        Alert.alert('Upload failed', 'Check your connection and try again.');
      }
    } catch (error) {
      // The camera throws on the simulator, among other places.
      console.error('Document upload error', error);
      Alert.alert('Couldn’t open the camera', 'Try choosing a photo from your library instead.');
    } finally {
      setUploadingType(null);
    }
  };

  const chooseSource = (docType: DocumentType) => {
    Alert.alert('Upload document', undefined, [
      { text: 'Take photo', onPress: () => upload(docType, 'camera') },
      { text: 'Choose from library', onPress: () => upload(docType, 'library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0066CC" />
        </View>
      </SafeAreaView>
    );
  }

  const approvedCount = documents.filter((d) => d.status === 'approved' && !isExpired(d)).length;
  const inReview = documents.some((d) => d.status === 'pending');

  let summary: string;
  if (verified) {
    summary = 'You’re verified and can accept jobs.';
  } else if (!savedVehicle?.vehicle_type) {
    summary = 'Add your vehicle and upload three documents to start accepting jobs.';
  } else if (inReview) {
    summary = `${approvedCount} of 3 documents approved. We’ll review the rest shortly.`;
  } else {
    summary = `${approvedCount} of 3 documents approved.`;
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={[styles.summaryCard, verified && styles.summaryCardVerified]}>
            <Text style={styles.summaryTitle}>{verified ? '✅ Verified' : 'Driver verification'}</Text>
            <Text style={styles.summaryBody}>{summary}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Vehicle</Text>
            <View style={styles.typeGrid}>
              {VEHICLE_TYPES.map((type) => {
                const selected = vehicleType === type.value;
                return (
                  <TouchableOpacity
                    key={type.value}
                    style={[styles.typeOption, selected && styles.typeOptionSelected]}
                    onPress={() => setVehicleType(type.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Text style={styles.typeIcon}>{type.icon}</Text>
                    <Text style={[styles.typeLabel, selected && styles.typeLabelSelected]}>
                      {type.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.trailerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>I have a trailer</Text>
                <Text style={styles.rowHint}>Some deliveries need one</Text>
              </View>
              <Switch
                value={hasTrailer}
                onValueChange={setHasTrailer}
                trackColor={{ false: '#E0E0E0', true: '#B3D9FF' }}
                thumbColor={hasTrailer ? '#0066CC' : '#FFFFFF'}
              />
            </View>

            {hasTrailer && (
              <View style={styles.inputGroup}>
                <Text style={styles.rowTitle}>Trailer capacity (lbs)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 10000"
                  placeholderTextColor="#999999"
                  keyboardType="number-pad"
                  value={trailerCapacity}
                  onChangeText={(text) => setTrailerCapacity(text.replace(/[^0-9]/g, ''))}
                />
              </View>
            )}

            {vehicleDirty && (
              <TouchableOpacity
                style={[styles.primaryButton, (!vehicleValid || savingVehicle) && styles.buttonDisabled]}
                onPress={handleSaveVehicle}
                disabled={!vehicleValid || savingVehicle}
              >
                {savingVehicle ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>Save vehicle</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Documents</Text>
            {DOCUMENTS.map((entry, index) => {
              const doc = documents.find((d) => d.doc_type === entry.type);
              const status = describeDocument(doc);
              const uploading = uploadingType === entry.type;
              return (
                <View
                  key={entry.type}
                  style={[styles.documentRow, index < DOCUMENTS.length - 1 && styles.documentRowDivider]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{entry.label}</Text>
                    <Text style={[styles.documentStatus, { color: status.color }]}>{status.text}</Text>
                    {!doc && <Text style={styles.rowHint}>{entry.hint}</Text>}
                  </View>
                  <TouchableOpacity
                    style={styles.uploadButton}
                    onPress={() => chooseSource(entry.type)}
                    disabled={uploadingType !== null}
                  >
                    {uploading ? (
                      <ActivityIndicator size="small" color="#0066CC" />
                    ) : (
                      <Text style={styles.uploadButtonText}>{doc ? 'Replace' : 'Upload'}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
            <Text style={styles.footnote}>
              Documents are only seen by our review team. Replacing an approved document sends it
              back for review.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryCard: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#0066CC',
    backgroundColor: '#F5F9FF',
    gap: 6,
  },
  summaryCardVerified: {
    borderColor: '#2E7D32',
    backgroundColor: '#F1F8F2',
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  summaryBody: {
    fontSize: 13,
    color: '#666666',
    lineHeight: 19,
  },
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#999999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeOption: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#FAFAFA',
  },
  typeOptionSelected: {
    borderColor: '#0066CC',
    backgroundColor: '#E3F2FD',
  },
  typeIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  typeLabelSelected: {
    color: '#0066CC',
    fontWeight: '700',
  },
  trailerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  rowHint: {
    fontSize: 12,
    color: '#999999',
    marginTop: 2,
  },
  inputGroup: {
    marginTop: 16,
    gap: 8,
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
  primaryButton: {
    marginTop: 16,
    backgroundColor: '#0066CC',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  documentRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  documentStatus: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  uploadButton: {
    minWidth: 84,
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0066CC',
  },
  uploadButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0066CC',
  },
  footnote: {
    fontSize: 12,
    color: '#999999',
    lineHeight: 17,
    marginTop: 12,
  },
});

export default Verification;
