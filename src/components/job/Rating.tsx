import React, { useState } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';

interface RatingPromptProps {
  /** Who the rater is being asked about, e.g. "your driver". */
  subject: string;
  onSubmit: (stars: number, comment?: string) => Promise<void>;
  onSkip: () => void;
}

const STARS = [1, 2, 3, 4, 5];

/**
 * Post-delivery rating prompt.
 *
 * Skippable by design: a rating that someone was forced to give to get
 * on with their day is worse data than no rating, and both sides here
 * are trying to work rather than review.
 */
export const RatingPrompt: React.FC<RatingPromptProps> = ({ subject, onSubmit, onSkip }) => {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (stars === 0) {
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(stars, comment.trim() || undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>How was {subject}?</Text>

      <View style={styles.starRow}>
        {STARS.map((value) => (
          <TouchableOpacity
            key={value}
            onPress={() => setStars(value)}
            style={styles.starTouch}
            accessibilityRole="button"
            accessibilityLabel={`${value} star${value === 1 ? '' : 's'}`}
          >
            <Text style={[styles.star, value <= stars && styles.starFilled]}>★</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* The comment field only appears once a score is chosen: asking for
          written feedback before someone has decided how they feel makes
          the prompt look like a form rather than a one-tap action. */}
      {stars > 0 && (
        <TextInput
          style={styles.input}
          placeholder="Add a comment (optional)"
          placeholderTextColor="#999999"
          value={comment}
          onChangeText={setComment}
          multiline
          maxLength={500}
        />
      )}

      <View style={styles.actions}>
        <TouchableOpacity onPress={onSkip} style={styles.skipButton} disabled={submitting}>
          <Text style={styles.skipText}>Not now</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSubmit}
          style={[styles.submitButton, stars === 0 && styles.submitButtonDisabled]}
          disabled={stars === 0 || submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.submitText}>Submit</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

interface RatingBadgeProps {
  average: number | null;
  count: number;
}

/**
 * Compact reputation display. A zero count reads as "New" rather than as
 * a bad score - showing 0.0 stars for someone nobody has rated yet would
 * be actively misleading.
 */
export const RatingBadge: React.FC<RatingBadgeProps> = ({ average, count }) => {
  if (count === 0 || average == null) {
    return <Text style={styles.badgeNew}>New driver</Text>;
  }

  return (
    <Text style={styles.badge}>
      ★ {average.toFixed(1)}{' '}
      <Text style={styles.badgeCount}>
        ({count} {count === 1 ? 'rating' : 'ratings'})
      </Text>
    </Text>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  starRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  starTouch: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  star: {
    fontSize: 32,
    color: '#D9D9D9',
  },
  starFilled: {
    color: '#F5A623',
  },
  input: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#1A1A1A',
    minHeight: 72,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 16,
    gap: 12,
  },
  skipButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
  },
  submitButton: {
    backgroundColor: '#0066CC',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 96,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#B8CFE8',
  },
  submitText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  badge: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  badgeCount: {
    fontSize: 13,
    fontWeight: '400',
    color: '#666666',
  },
  badgeNew: {
    fontSize: 13,
    color: '#666666',
  },
});
