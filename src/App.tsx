import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import AuthNavigator from './navigation/AuthNavigator';

const App: React.FC = () => {
  return (
    <>
      <StatusBar style="dark" />
      <NavigationContainer>
        <AuthNavigator />
      </NavigationContainer>
    </>
  );
};

export default App;