import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { loginSchema, type LoginInput } from '@eventflow/validators';
import { api } from '@/src/lib/api';
import { useAuthStore } from '@/src/store/authStore';
import type { AuthUser } from '@eventflow/types';

export default function LoginScreen() {
  const { setAuth } = useAuthStore();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginInput) => {
    setServerError(null);
    try {
      const res = await api.post<{
        data: { tokens: { accessToken: string }; user: AuthUser };
      }>('/auth/login', data);
      setAuth({
        user: res.data.data.user,
        accessToken: res.data.data.tokens.accessToken,
      });
      router.replace('/(app)/scanner');
    } catch {
      setServerError('Invalid email or password. Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 justify-center px-6 py-12">
          {/* Header */}
          <View className="mb-8">
            <Text className="text-3xl font-bold text-indigo-600">EventFlow</Text>
            <Text className="text-xl font-semibold text-gray-900 mt-1">Staff Portal</Text>
            <Text className="text-sm text-gray-500 mt-1">Sign in to manage check-ins</Text>
          </View>

          {/* Error banner */}
          {serverError && (
            <View className="mb-5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <Text className="text-sm text-red-700">{serverError}</Text>
            </View>
          )}

          {/* Form */}
          <View className="gap-y-4">
            
            {/* Email field */}
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1.5">Email address</Text>
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={{ minHeight: 52 }}
                    className={`rounded-xl border px-4 text-base bg-white ${
                      errors.email ? 'border-red-400 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="staff@example.com"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                  />
                )}
              />
              {errors.email && (
                <Text className="mt-1 text-xs text-red-600">{errors.email.message}</Text>
              )}
            </View>

            {/* Password field */}
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1.5">Password</Text>
              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={{ minHeight: 52 }}
                    className={`rounded-xl border px-4 text-base bg-white ${
                      errors.password ? 'border-red-400 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="••••••••"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry
                    autoComplete="current-password"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                  />
                )}
              />
              {errors.password && (
                <Text className="mt-1 text-xs text-red-600">{errors.password.message}</Text>
              )}
            </View>

            {/* Submit button */}
            <TouchableOpacity
              style={{ minHeight: 52 }}
              className={`mt-2 rounded-xl items-center justify-center ${
                isSubmitting ? 'bg-indigo-400' : 'bg-indigo-600'
              }`}
              onPress={handleSubmit(onSubmit)}
              disabled={isSubmitting}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-base font-semibold text-white">Sign in</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
