import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';

export interface BottomNavItem {
  key: string;
  icon: string;
  label: string;
  onPress: () => void;
}

interface BottomNavBarProps {
  items: BottomNavItem[];
}

/**
 * Shared bottom tab bar, drawn the same way on every top-level screen in a
 * role's stack (contractor: Requests/New/Tracking/Profile, driver:
 * Jobs/Earnings/Profile) so Profile - and the logout button on it - is
 * always one tap away instead of only reachable from one screen.
 */
const BottomNavBar: React.FC<BottomNavBarProps> = ({ items }) => (
  <View style={styles.bottomNav}>
    {items.map((item) => (
      <TouchableOpacity key={item.key} style={styles.navItem} onPress={item.onPress}>
        <Text style={styles.navIcon}>{item.icon}</Text>
        <Text style={styles.navLabel}>{item.label}</Text>
      </TouchableOpacity>
    ))}
  </View>
);

const styles = StyleSheet.create({
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingBottom: 16,
    paddingHorizontal: 8,
    paddingTop: 12,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  navIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666666',
    textAlign: 'center',
  },
});

export default BottomNavBar;
