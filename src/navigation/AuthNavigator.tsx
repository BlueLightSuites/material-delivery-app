import React from 'react';
import { createStackNavigator, StackNavigationProp } from '@react-navigation/stack';
import SignIn from '../screens/Auth/SignIn';
import SignUp from '../screens/Auth/SignUp';
import ForgotPassword from '../screens/Auth/ForgotPassword';

export type AuthStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
};

export type AuthNavigationProp = StackNavigationProp<AuthStackParamList>;

const Stack = createStackNavigator<AuthStackParamList>();

const AuthNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animationEnabled: true,
        cardStyle: { backgroundColor: '#FFFFFF' },
      }}
    >
      <Stack.Screen
        name="SignIn"
        component={SignIn}
        options={{ animationEnabled: false }}
      />
      <Stack.Screen
        name="SignUp"
        component={SignUp}
        options={{
          animationEnabled: true,
          gestureEnabled: true,
        }}
      />
      <Stack.Screen
        name="ForgotPassword"
        component={ForgotPassword}
        options={{
          animationEnabled: true,
          gestureEnabled: true,
        }}
      />
    </Stack.Navigator>
  );
};

export default AuthNavigator;
