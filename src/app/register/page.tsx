'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Validation
    if (!formData.username || !formData.password) {
      setError('Please fill in all fields');
      setIsLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      // Registration successful - redirect to settings
      router.push('/settings?firstTime=true');
      
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200">
      <div className="card lg:card-side bg-base-100 shadow-xl max-w-4xl">
        
        {/* Left Side - Instructions */}
        <div className="card-body lg:w-1/2 bg-gradient-to-br from-primary to-accent text-primary-content">
          <h2 className="card-title text-2xl mb-4">Welcome to GitLab Sanitation Dashboard</h2>
          
          <div className="space-y-4">
            <div className="alert alert-info">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span>After registration, you'll configure your first GitLab project</span>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-lg">How to get your GitLab details:</h3>
              
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="badge badge-sm">1</span>
                  <div>
                    <p className="font-medium">GitLab Personal Access Token:</p>
                    <ul className="list-disc list-inside text-xs space-y-1">
                      <li>Go to GitLab → User Settings → Access Tokens</li>
                      <li>Create token with: read_api, read_repository, read_user</li>
                      <li>Copy the token (starts with glpat-)</li>
                    </ul>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <span className="badge badge-sm">2</span>
                  <div>
                    <p className="font-medium">Project ID:</p>
                    <ul className="list-disc list-inside text-xs space-y-1">
                      <li>Go to your GitLab project</li>
                      <li>Copy from URL: gitlab.com/your-group/your-project</li>
                      <li>Or use numeric ID from project settings</li>
                    </ul>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <span className="badge badge-sm">3</span>
                  <div>
                    <p className="font-medium">GitLab Host:</p>
                    <ul className="list-disc list-inside text-xs space-y-1">
                      <li>For GitLab.com: https://gitlab.com</li>
                      <li>For self-hosted: https://your-gitlab-instance.com</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="alert alert-warning">
                <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>Your credentials will be encrypted and stored securely</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Registration Form */}
        <div className="card-body lg:w-1/2">
          <h2 className="card-title text-2xl mb-4">Create Account</h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text">Username</span>
              </label>
              <input
                type="text"
                placeholder="johndoe"
                className="input input-bordered"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
              />
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">Password</span>
              </label>
              <input
                type="password"
                placeholder="••••••••"
                className="input input-bordered"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
              />
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">Confirm Password</span>
              </label>
              <input
                type="password"
                placeholder="••••••••"
                className="input input-bordered"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                required
              />
            </div>

            {error && (
              <div className="alert alert-error">
                <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <div className="card-actions justify-between items-center">
              <Link href="/login" className="link link-hover">
                Already have an account? Sign in
              </Link>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <span className="loading loading-spinner"></span>
                    Creating Account...
                  </>
                ) : (
                  'Create Account'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}