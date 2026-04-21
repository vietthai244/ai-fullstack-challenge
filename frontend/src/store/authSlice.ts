// frontend/src/store/authSlice.ts
//
// Phase 8 (UI-01/UI-05): Auth Redux slice.
// Redux owns ONLY: accessToken, user, bootstrapped.
// Server data (campaigns, recipients, stats) MUST NOT be added here.
// clearAuth sets bootstrapped=true — we know the state (logged out); false would re-trigger bootstrap loop.
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  accessToken: string | null;
  user: { id: number; email: string } | null;
  bootstrapped: boolean;
}

const initialState: AuthState = {
  accessToken: null,
  user: null,
  bootstrapped: false,
};

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuth: (
      state,
      action: PayloadAction<{ accessToken: string; user: { id: number; email: string } }>,
    ) => {
      state.accessToken = action.payload.accessToken;
      state.user = action.payload.user;
      state.bootstrapped = true;
    },
    setToken: (state, action: PayloadAction<string>) => {
      state.accessToken = action.payload;
    },
    clearAuth: (state) => {
      state.accessToken = null;
      state.user = null;
      // bootstrapped stays true — we know the auth state (logged out).
      // Setting false would cause the bootstrap hook to re-run and loop.
      state.bootstrapped = true;
    },
    setBootstrapped: (state) => {
      state.bootstrapped = true;
    },
  },
});

export const { setAuth, setToken, clearAuth, setBootstrapped } = authSlice.actions;
export default authSlice.reducer;
