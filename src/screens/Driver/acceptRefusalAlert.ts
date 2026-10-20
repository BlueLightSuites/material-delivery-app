import { Alert } from 'react-native';
import { AcceptOutcome } from '../../services/api/deliveryRequests';

/**
 * Explain why an accept didn't go through, for the outcomes the feed and
 * the job detail screen answer the same way. "Taken" isn't here: each
 * screen handles that differently (refetch vs. go back to the feed).
 */
export function alertAcceptRefusal(
  outcome: Extract<AcceptOutcome, { kind: 'not_verified' | 'trailer_required' | 'failed' }>,
  openVerification: () => void
) {
  if (outcome.kind === 'not_verified') {
    Alert.alert(
      'Verification needed',
      'Add your vehicle and upload your license, registration, and insurance. You can accept jobs once they’re approved.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Set up', onPress: openVerification },
      ]
    );
  } else if (outcome.kind === 'trailer_required') {
    Alert.alert(
      'Trailer required',
      'This delivery needs a trailer, and your vehicle details say you don’t have one.',
      [
        { text: 'OK', style: 'cancel' },
        { text: 'Update vehicle', onPress: openVerification },
      ]
    );
  } else {
    Alert.alert('Couldn’t accept job', 'Check your connection and try again.');
  }
}
