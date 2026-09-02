const getBaseUrl = () => import.meta.env.VITE_API_BASE_URL || '';

export const login = async (email, password) => {
  const baseUrl = getBaseUrl();

  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    let errorMsg = 'Invalid email or password';
    try {
      const errorData = await response.json();
      errorMsg = errorData.detail || errorMsg;
    } catch (e) {
      // Fallback if not json
    }
    throw new Error(errorMsg);
  }

  return await response.json(); // { email, token }
};

export const extractPdf = async (file) => {
  // Use VITE_API_BASE_URL if set, otherwise fallback to Vite proxy route
  const baseUrl = getBaseUrl();
  
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(`${baseUrl}/api/v1/extract`, {
      method: 'POST',
      body: formData,
      // Note: fetch automatically sets the correct Content-Type with boundary for FormData
    });

    if (!response.ok) {
      let errorMsg = 'Failed to extract PDF';
      try {
        const errorData = await response.json();
        errorMsg = errorData.detail || errorMsg;
      } catch (e) {
        // Fallback if not json
      }
      throw new Error(errorMsg);
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
};
