import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { saveUserName } from '../../services/api/users';

/**
 * Shown instead of the app to a signed-in account with no name - those
 * from before signup required one. A name is required everywhere it's
 * shown: a reviewer checks it against a driver's license, and Slack
 * alerts and the review queue identify people by it.
 */
const CompleteProfile: React.FC = () => {
  const { user, accessToken, updateUser, logout } = useAuth();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const trimmed = name.trim();

  const handleSave = async () => {
    if (!user || !accessToken || !trimmed) {
      return;
    }
    setSaving(true);
    const ok = await saveUserName(accessToken, user, trimmed);
    if (ok) {
      // Unmounts this screen: App renders the main app once there's a name.
      await updateUser({ name: trimmed });
    } else {
      setSaving(false);
      Alert.alert('Couldn’t save your name', 'Check your connection and try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.title}>What’s your name?</Text>
        <Text style={styles.subtitle}>
          {user?.role === 'driver'
            ? 'Use the name on your driver’s license. It’s checked when your documents are reviewed.'
            : 'This is how you’ll appear to the people you work with.'}
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Full name"
          placeholderTextColor="#999999"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSave}
          editable={!saving}
        />

        <TouchableOpacity
          style={[styles.button, (!trimmed || saving) && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={!trimmed || saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Continue</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOut} onPress={logout} disabled={saving}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#666666',
    lineHeight: 21,
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1A1A1A',
    backgroundColor: '#FAFAFA',
  },
  button: {
    marginTop: 16,
    backgroundColor: '#0066CC',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  signOut: {
    marginTop: 20,
    alignItems: 'center',
  },
  signOutText: {
    fontSize: 14,
    color: '#999999',
  },
});

export default CompleteProfile;
