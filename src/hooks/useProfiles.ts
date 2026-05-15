import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { ProfileSummary, PIITypeDefinition } from '../types';

export function useProfiles() {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [customTypes, setCustomTypes] = useState<PIITypeDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profilesData, customData] = await Promise.all([
        api.getProfiles(),
        api.getCustomTypes()
      ]);
      setProfiles(profilesData);
      setCustomTypes(customData);
    } catch (err: any) {
      setError(err.message || 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addCustomType = async (name: string, description: string) => {
    try {
      const newType = await api.addCustomType(name, description);
      setCustomTypes(prev => [...prev, newType]);
      return true;
    } catch (err: any) {
      throw new Error(err.message || 'Failed to add custom type');
    }
  };

  const removeCustomType = async (name: string) => {
    try {
      await api.removeCustomType(name);
      setCustomTypes(prev => prev.filter(t => t.name !== name));
      return true;
    } catch (err: any) {
      throw new Error(err.message || 'Failed to remove custom type');
    }
  };

  return {
    profiles,
    customTypes,
    loading,
    error,
    refresh: fetchData,
    addCustomType,
    removeCustomType
  };
}
