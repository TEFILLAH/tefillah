import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { 
  useAnimatedStyle, 
  withSpring,
  interpolateColor,
} from 'react-native-reanimated';
import { useTheme } from '../store/themeStore';

interface ThemeToggleProps {
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
}

const AnimatedView = Animated.createAnimatedComponent(View);

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ 
  size = 'medium',
  showLabel = false 
}) => {
  const { mode, colors, toggleTheme, isDark } = useTheme();
  
  const dimensions = {
    small: { width: 50, height: 28, knob: 22, icon: 14 },
    medium: { width: 60, height: 32, knob: 26, icon: 16 },
    large: { width: 70, height: 36, knob: 30, icon: 18 },
  }[size];
  
  const knobStyle = useAnimatedStyle(() => ({
    transform: [
      { 
        translateX: withSpring(isDark ? 2 : dimensions.width - dimensions.knob - 2, {
          damping: 15,
          stiffness: 120,
        })
      }
    ],
  }));
  
  return (
    <View style={styles.container}>
      {showLabel && (
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {isDark ? 'Dark' : 'Light'}
        </Text>
      )}
      <TouchableOpacity
        onPress={toggleTheme}
        activeOpacity={0.8}
        style={[
          styles.track,
          {
            width: dimensions.width,
            height: dimensions.height,
            borderRadius: dimensions.height / 2,
            backgroundColor: isDark ? '#1a1a1a' : '#e5e7eb',
            borderColor: isDark ? '#333' : '#d1d5db',
          }
        ]}
        data-testid="theme-toggle"
      >
        <AnimatedView
          style={[
            styles.knob,
            {
              width: dimensions.knob,
              height: dimensions.knob,
              borderRadius: dimensions.knob / 2,
              backgroundColor: colors.accent,
            },
            knobStyle,
          ]}
        >
          <Ionicons
            name={isDark ? 'moon' : 'sunny'}
            size={dimensions.icon}
            color={isDark ? '#000' : '#fff'}
          />
        </AnimatedView>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
  track: {
    justifyContent: 'center',
    borderWidth: 1,
  },
  knob: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
});

export default ThemeToggle;
