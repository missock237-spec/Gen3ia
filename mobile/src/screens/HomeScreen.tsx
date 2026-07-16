import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../services/api';

export default function HomeScreen({ navigation }: any) {
  const [stats, setStats] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = async () => {
    try {
      const { data } = await api.get('/dashboard/stats');
      setStats(data);
    } catch (e) {
      console.error('Erreur chargement stats:', e);
    }
  };

  useEffect(() => { loadStats(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View className="px-4 pt-6">
          <Text className="text-3xl font-bold text-gray-900">Genova</Text>
          <Text className="text-gray-500 mt-1">Assistant IA intelligent</Text>
        </View>

        <View className="flex-row flex-wrap px-2 mt-6">
          {[
            { title: 'Messages', value: stats?.messages || 0, color: 'bg-indigo-500' },
            { title: 'Documents', value: stats?.documents || 0, color: 'bg-purple-500' },
            { title: 'XP Gagnés', value: stats?.xp || 0, color: 'bg-amber-500' },
            { title: 'Niveau', value: stats?.level || 1, color: 'bg-green-500' },
          ].map((card, i) => (
            <View key={i} className="w-1/2 p-2">
              <View className={`${card.color} rounded-2xl p-4`}>
                <Text className="text-white/80 text-sm">{card.title}</Text>
                <Text className="text-white text-3xl font-bold mt-1">{card.value}</Text>
              </View>
            </View>
          ))}
        </View>

        <View className="px-4 mt-6">
          <Text className="text-lg font-semibold text-gray-900 mb-3">Actions rapides</Text>
          <View className="flex-row flex-wrap">
            {[
              { label: '💬 Chat', screen: 'Chat', color: 'bg-indigo-100' },
              { label: '🎤 Voice', screen: 'Voice', color: 'bg-pink-100' },
              { label: '📄 Docs', screen: 'Documents', color: 'bg-blue-100' },
              { label: '🏆 Badges', screen: 'Badges', color: 'bg-amber-100' },
            ].map((action, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => navigation.navigate(action.screen)}
                className={`${action.color} rounded-xl p-4 mr-3 mb-3 min-w-[100px]`}
              >
                <Text className="text-gray-800 font-medium">{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View className="px-4 mt-6 mb-8">
          <Text className="text-lg font-semibold text-gray-900 mb-3">Activité récente</Text>
          {stats?.recentActivity?.map((item: any, i: number) => (
            <View key={i} className="bg-white rounded-xl p-4 mb-2 shadow-sm">
              <Text className="text-gray-800">{item.description}</Text>
              <Text className="text-gray-400 text-xs mt-1">{item.time}</Text>
            </View>
          )) || (
            <Text className="text-gray-400">Aucune activité récente</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
