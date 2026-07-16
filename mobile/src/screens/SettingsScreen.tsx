import React from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { logout } from '../services/auth';
import { disconnectSocket } from '../services/websocket';

export default function SettingsScreen({ navigation }: any) {
  const handleLogout = () => {
    Alert.alert('Déconnexion', 'Voulez-vous vraiment vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Déconnecter',
        style: 'destructive',
        onPress: async () => {
          disconnectSocket();
          await logout();
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="px-4 pt-4">
        <Text className="text-2xl font-bold text-gray-900">Paramètres</Text>
      </View>

      <View className="px-4 mt-6">
        <View className="bg-white rounded-xl shadow-sm">
          {[
            { label: '👤 Profil', action: () => {} },
            { label: '🔔 Notifications', action: () => {} },
            { label: '🎨 Thème', action: () => {} },
            { label: '🔒 Confidentialité', action: () => {} },
            { label: 'ℹ️ À propos', action: () => {} },
          ].map((item, i) => (
            <TouchableOpacity
              key={i}
              onPress={item.action}
              className="flex-row items-center p-4 border-b border-gray-100"
            >
              <Text className="text-gray-800 text-base">{item.label}</Text>
              <Text className="ml-auto text-gray-400">›</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          onPress={handleLogout}
          className="bg-red-50 rounded-xl py-4 items-center mt-8"
        >
          <Text className="text-red-600 font-semibold">Se déconnecter</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
