// Simple session-based auth for MVP
// Stores email in localStorage

export const loginUser = (email: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('user_email', email);
  }
};

export const logoutUser = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('user_email');
  }
};

export const getUser = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('user_email');
  }
  return null;
};

export const isAuthenticated = () => {
  return !!getUser();
};
