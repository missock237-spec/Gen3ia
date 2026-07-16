import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { login } from '../services/auth';

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      navigation.replace('Main');
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message || 'Identifiants invalides');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white justify-center px-6">
      <View className="items-center mb-10">
        <Text className="text-5xl mb-2">🧬</Text>
        <Text className="text-3xl font-bold text-indigo-600">Genova</Text>
        <Text className="text-gray-400 mt-2">Connecte-toi à ton assistant</Text>
      </View>

      <TextInput
        className="bg-gray-100 rounded-xl px-5 py-4 text-gray-800 mb-4"
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        className="bg-gray-100 rounded-xl px-5 py-4 text-gray-800 mb-6"
        placeholder="Mot de passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity
        onPress={handleLogin}
        disabled={loading}
        className="bg-indigo-500 rounded-2xl py-4 items-center mb-4"
      >
        <Text className="text-white font-semibold text-lg">
          {loading ? 'Connexion...' : 'Se connecter'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Register')} className="items-center">
        <Text className="text-indigo-600">Pas de compte ? S'inscrire</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
