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
    
    // Fetch profiles and custom types separately to be resilient to partial failures
    const fetchProfiles = async () => {
      try {
        const data = await api.getProfiles();
        setProfiles(data);
      } catch (err: any) {
        console.error('Failed to load profiles:', err);
        setError(prev => prev || 'Failed to load profiles');
      }
    };

    const fetchCustomTypes = async () => {
      try {
        const data = await api.getCustomTypes();
        setCustomTypes(data);
      } catch (err: any) {
        console.error('Failed to load custom types:', err);
      }
    };

    await Promise.all([fetchProfiles(), fetchCustomTypes()]);
    setLoading(false);
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

  const updateCustomType = async (currentName: string, name: string, description: string) => {
    try {
      const updatedType = await api.updateCustomType(currentName, name, description);
      setCustomTypes(prev => prev.map(type => type.name === currentName ? updatedType : type));
      return true;
    } catch (err: any) {
      throw new Error(err.message || 'Failed to update custom type');
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
    updateCustomType,
    removeCustomType
  };
}
