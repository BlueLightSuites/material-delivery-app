import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './context/AuthContext';
import AuthNavigator from './navigation/AuthNavigator';
import MainNavigator from './navigation/MainNavigator';

const AppContent: React.FC = () => {
  const { user } = useAuth();

  return (
    <>
      <StatusBar style="dark" />
      <NavigationContainer>
        {user ? (
          <MainNavigator user={user} />
        ) : (
          <AuthNavigator />
        )}
      </NavigationContainer>
    </>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;