import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  Image,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { MainStackParamList } from '../../navigation/MainNavigator';
import { useAuth } from '../../context/AuthContext';
import { getDocumentImageUrl, reviewDocument } from '../../services/api/documentReview';
import { DOCUMENT_LABELS, VEHICLE_TYPE_LABELS } from '../../services/api/driverVerification';
import { timeAgo } from './ReviewQueue';

type DocumentReviewNavigationProp = StackNavigationProp<MainStackParamList, 'DocumentReview'>;
type DocumentReviewRouteProp = RouteProp<MainStackParamList, 'DocumentReview'>;

interface DocumentReviewProps {
  navigation: DocumentReviewNavigationProp;
  route: DocumentReviewRouteProp;
}

// The reasons that come up again and again, one tap each. Anything else
// can still be typed.
const QUICK_REASONS = [
  'Photo is blurry or cut off',
  'Document has expired',
  'Name doesn’t match the account',
  'Wrong document',
];

/** Digits in, YYYY-MM-DD out, so the reviewer never types a dash. */
const formatDateInput = (text: string) => {
  const digits = text.replace(/[^0-9]/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
};

/** Null if valid, otherwise what's wrong. The server checks the same. */
const expiryProblem = (value: string): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return 'Enter the expiry date printed on the document.';
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return 'That isn’t a real date.';
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) {
    return 'This document has expired. Reject it instead.';
  }
  return null;
};

const DocumentReview: React.FC<DocumentReviewProps> = ({ navigation, route }) => {
  const { item } = route.params;
  const { accessToken } = useAuth();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageState, setImageState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [mode, setMode] = useState<'approve' | 'reject' | null>(null);
  const [expiresOn, setExpiresOn] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadImage = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setImageState('loading');
    const url = await getDocumentImageUrl(accessToken, item.storage_path);
    setImageUrl(url);
    if (!url) {
      setImageState('failed');
    }
  }, [accessToken, item.storage_path]);

  useEffect(() => {
    loadImage();
  }, [loadImage]);

  const label = DOCUMENT_LABELS[item.doc_type];
  const expiryError = mode === 'approve' && expiresOn.length === 10 ? expiryProblem(expiresOn) : null;

  const submit = async () => {
    if (!accessToken || !mode) {
      return;
    }
    if (mode === 'approve') {
      const problem = expiryProblem(expiresOn);
      if (problem) {
        Alert.alert('Check the expiry date', problem);
        return;
      }
    } else if (!reason.trim()) {
      Alert.alert('Add a reason', 'The driver is shown this, so they know what to fix.');
      return;
    }

    setSubmitting(true);
    const outcome = await reviewDocument(
      accessToken,
      item,
      mode === 'approve'
        ? { kind: 'approved', expiresOn }
        : { kind: 'rejected', reason: reason.trim() }
    );
    setSubmitting(false);

    if (outcome.kind === 'reviewed') {
      navigation.goBack();
    } else if (outcome.kind === 'changed') {
      Alert.alert(
        'This document changed',
        'The driver uploaded a new file, or someone else already reviewed it.',
        [{ text: 'Back to queue', onPress: () => navigation.goBack() }]
      );
    } else {
      Alert.alert('Couldn’t save the review', outcome.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.docLabel}>{label}</Text>
            <Text style={styles.driverName}>{item.driver_name || 'Unnamed driver'}</Text>
            {item.driver_email && <Text style={styles.meta}>{item.driver_email}</Text>}
            <Text style={styles.meta}>Uploaded {timeAgo(item.submitted_at)}</Text>
          </View>

          {/* Pinch to zoom: reading a license number off a phone photo
              usually needs it. */}
          <View style={styles.imageFrame}>
            {imageState === 'failed' ? (
              <TouchableOpacity style={styles.imageMessage} onPress={loadImage}>
                <Text style={styles.imageMessageText}>Couldn’t load the file. Tap to retry.</Text>
              </TouchableOpacity>
            ) : (
              <ScrollView
                maximumZoomScale={5}
                minimumZoomScale={1}
                centerContent
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
              >
                {imageUrl && (
                  <Image
                    source={{ uri: imageUrl }}
                    style={styles.image}
                    resizeMode="contain"
                    onLoad={() => setImageState('ready')}
                    onError={() => setImageState('failed')}
                  />
                )}
              </ScrollView>
            )}
            {imageState === 'loading' && (
              <ActivityIndicator style={StyleSheet.absoluteFill} size="large" color="#FFFFFF" />
            )}
          </View>
          <Text style={styles.zoomHint}>Pinch to zoom</Text>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Check against</Text>
            <Text style={styles.checkLine}>Name on the account: {item.driver_name || '—'}</Text>
            {item.doc_type === 'registration' && (
              <Text style={styles.checkLine}>
                Vehicle: {item.vehicle_type ? VEHICLE_TYPE_LABELS[item.vehicle_type] : 'not set'}
                {item.has_trailer ? ` + trailer (${item.trailer_capacity_lbs} lbs)` : ''}
              </Text>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Decision</Text>
            <View style={styles.choiceRow}>
              <TouchableOpacity
                style={[styles.choice, mode === 'approve' && styles.choiceApprove]}
                onPress={() => setMode('approve')}
              >
                <Text style={[styles.choiceText, mode === 'approve' && styles.choiceTextActive]}>
                  ✓ Approve
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.choice, mode === 'reject' && styles.choiceReject]}
                onPress={() => setMode('reject')}
              >
                <Text style={[styles.choiceText, mode === 'reject' && styles.choiceTextActive]}>
                  ✕ Reject
                </Text>
              </TouchableOpacity>
            </View>

            {mode === 'approve' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Expiry date on the document</Text>
                <TextInput
                  style={[styles.input, expiryError && styles.inputError]}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#999999"
                  keyboardType="number-pad"
                  value={expiresOn}
                  onChangeText={(text) => setExpiresOn(formatDateInput(text))}
                />
                {expiryError && <Text style={styles.errorText}>{expiryError}</Text>}
                <Text style={styles.inputHint}>
                  The driver stops being able to accept jobs after this date until they upload a current one.
                </Text>
              </View>
            )}

            {mode === 'reject' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Reason (the driver sees this)</Text>
                <View style={styles.reasonChips}>
                  {QUICK_REASONS.map((quick) => (
                    <TouchableOpacity
                      key={quick}
                      style={[styles.reasonChip, reason === quick && styles.reasonChipActive]}
                      onPress={() => setReason(quick)}
                    >
                      <Text style={[styles.reasonChipText, reason === quick && styles.reasonChipTextActive]}>
                        {quick}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Or write your own"
                  placeholderTextColor="#999999"
                  value={reason}
                  onChangeText={setReason}
                  multiline
                />
              </View>
            )}

            {mode && (
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  mode === 'reject' && styles.submitReject,
                  submitting && styles.buttonDisabled,
                ]}
                onPress={submit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitText}>
                    {mode === 'approve' ? `Approve ${label.toLowerCase()}` : 'Reject and notify driver'}
                  </Text>
                )}
              </TouchableOpacity>
            )}
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    gap: 2,
  },
  docLabel: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  driverName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  meta: {
    fontSize: 13,
    color: '#999999',
  },
  imageFrame: {
    marginHorizontal: 16,
    height: 380,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
  },
  image: {
    width: '100%',
    height: 380,
  },
  imageMessage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  imageMessageText: {
    color: '#FFFFFF',
    fontSize: 14,
    textAlign: 'center',
  },
  zoomHint: {
    fontSize: 12,
    color: '#999999',
    textAlign: 'center',
    marginTop: 6,
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
    marginBottom: 10,
  },
  checkLine: {
    fontSize: 14,
    color: '#1A1A1A',
    marginBottom: 4,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 10,
  },
  choice: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#FAFAFA',
  },
  choiceApprove: {
    borderColor: '#2E7D32',
    backgroundColor: '#2E7D32',
  },
  choiceReject: {
    borderColor: '#C62828',
    backgroundColor: '#C62828',
  },
  choiceText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  choiceTextActive: {
    color: '#FFFFFF',
  },
  inputGroup: {
    marginTop: 16,
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
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
  inputError: {
    borderColor: '#C62828',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  errorText: {
    fontSize: 12,
    color: '#C62828',
  },
  inputHint: {
    fontSize: 12,
    color: '#999999',
    lineHeight: 17,
  },
  reasonChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reasonChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#FAFAFA',
  },
  reasonChipActive: {
    borderColor: '#C62828',
    backgroundColor: '#FFEBEE',
  },
  reasonChipText: {
    fontSize: 13,
    color: '#1A1A1A',
  },
  reasonChipTextActive: {
    color: '#C62828',
    fontWeight: '600',
  },
  submitButton: {
    marginTop: 16,
    backgroundColor: '#2E7D32',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitReject: {
    backgroundColor: '#C62828',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  submitText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default DocumentReview;
