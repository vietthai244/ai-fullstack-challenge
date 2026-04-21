// frontend/src/store/index.ts
//
// Phase 8 (UI-01): Redux store singleton.
// Imported at module scope by apiClient.ts — must not cause circular deps.
// Export RootState + AppDispatch types so hooks and components are fully typed.
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/store/authSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
