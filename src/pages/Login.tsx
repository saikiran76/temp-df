import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { signIn, signInWithGoogle } from '@/store/slices/authSlice';
import { FcGoogle } from 'react-icons/fc';
import { useLogger } from '@/hooks/useLogger';
import type { AppDispatch, RootState } from '@/store/store';
import LavaLamp from '@/components/ui/Loader/LavaLamp';
import CentralLoader from '@/components/ui/CentralLoader';
// import bgLeft from '@/images/loginbg.png';
// import bgRight from '@/images/loginbg2.png';
// import '@/styles/BorderStyles.css';

// Shadcn UI components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardFooter, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, X, Eye, EyeOff } from "lucide-react";
import { Label } from "@/components/ui/label";

// Background image
const bgImage = "https://searchengineland.com/wp-content/seloads/2023/12/The-top-5-social-media-platforms-you-should-focus-on.png";

// Custom hook for typed dispatch
const useAppDispatch = () => useDispatch<AppDispatch>();
// Custom hook for typed selector
const useAppSelector = (selector: (state: RootState) => any) => useSelector(selector);

const Login = () => {
  const logger = useLogger();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  
  const authState = useAppSelector((state) => state.auth);
  const { error, loading: isLoading, googleAuthPending, session } = authState;
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState('');
  const [redirectPath, setRedirectPath] = useState<string | null>(null);

  // Parse redirect query parameter on initial load
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const redirect = params.get('redirect');
    if (redirect) {
      setRedirectPath(redirect);
      logger.info('[Login] Found redirect parameter:', redirect);
    }
  }, [location.search, logger]);

  // Redirect authenticated users
  useEffect(() => {
    if (session) {
      logger.info('[Login] User is authenticated, redirecting');
      if (redirectPath) {
        navigate(redirectPath);
      } else {
        navigate('/dashboard');
      }
    }
  }, [session, redirectPath, navigate, logger]);

  // Form validation
  const validateForm = (): boolean => {
    if (!email.trim()) {
      setLocalError('Email is required');
      return false;
    }
    
    if (!password) {
      setLocalError('Password is required');
      return false;
    }
    
    // Clear previous errors
    setLocalError('');
    return true;
  };

  // Handle Google Sign-in
  const handleGoogleSignIn = async () => {
    try {
      setLocalError('');
      logger.info('[Login] Initiating Google sign-in process');
      
      // Save redirect path to localStorage for OAuth flow
      if (redirectPath) {
        localStorage.setItem('auth_redirect', redirectPath);
      }
      
      await dispatch(signInWithGoogle());
      // The page will be redirected by the Google OAuth flow
    } catch (error: any) {
      logger.error('[Login] Google sign-in error:', error);
      setLocalError(error?.message || 'Failed to sign in with Google. Please try again.');
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (!validateForm()) {
      return;
    }
    
    try {
      setLocalError('');
      
      logger.info('[Login] Attempting to sign in with email');
      
      // Dispatch sign in action with credentials
      await dispatch(signIn({ email, password }));
      
      logger.info('[Login] Sign in successful');
      
      // Handle redirect after successful login
      if (redirectPath) {
        navigate(redirectPath);
      } else {
        navigate('/dashboard');
      }
    } catch (error: any) {
      logger.error('[Login] Sign in error:', error);
      setLocalError(error?.message || 'Invalid email or password. Please try again.');
    }
  };

  // Show full-screen loader during authentication process
  if (isLoading || googleAuthPending) {
    return (
      <CentralLoader
        message={googleAuthPending ? "Connecting with Google..." : "Signing you in..."}
        subMessage="Please wait while we authenticate your account"
      />
    );
  }

  return (
    <div className="grid min-h-screen bg-black text-white lg:grid-cols-2">
      <div className="flex flex-col items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:justify-start">
            <Link to="/" className="text-2xl font-bold">
              DailyFix
            </Link>
          </div>
          
          <div className="space-y-2 text-center lg:text-left">
            <h1 className="text-2xl font-bold">Login</h1>
            <p className="text-sm text-gray-400">
              Enter your email below to login to your account
            </p>
          </div>

          {(localError || error) && (
            <Alert variant="destructive" className="mt-6">
              <AlertCircle className="h-5 w-5" />
              <AlertDescription className="ml-3 flex-1 text-sm">
                {localError || error}
              </AlertDescription>
              <X 
                className="h-5 w-5 ml-auto cursor-pointer hover:opacity-70 transition-opacity" 
                onClick={() => setLocalError('')} 
              />
            </Alert>
          )}

          <div className="mt-6 space-y-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                  className="w-full bg-gray-900 border-gray-700 rounded-md"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center">
                  <Label htmlFor="password" className="">Password</Label>
                  <Link 
                    to="/forgot-password" 
                    className="ml-auto text-sm text-primary hover:underline underline-offset-4"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                    className="w-full bg-gray-900 border-gray-700 rounded-md"
                    required
                  />
                  <button
                    type="button"
                    className="absolute bg-transparent right-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              
              <Button type="submit" className="w-full">
                Login
              </Button>
            </form>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="border-gray-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-black px-2 text-gray-500">
                  Or continue with
                </span>
              </div>
            </div>
            
            <Button
              type="button"
              onClick={handleGoogleSignIn}
              variant="outline"
              className="w-full"
            >
              <FcGoogle className="mr-2 h-5 w-5" />
              Google
            </Button>
            
            <div className="text-center text-sm text-gray-400">
              Don't have an account?{" "}
              <Link to="/signup" className="text-primary hover:underline underline-offset-4">
                Sign up
              </Link>
            </div>
          </div>
        </div>
      </div>
      <div className="relative hidden lg:block">
        <img
          src={bgImage}
          alt="A person using multiple social media apps on their phone"
          className="absolute inset-0 h-full w-full object-cover brightness-50"
        />
        <div className="relative z-10 flex h-full flex-col justify-end p-10 text-white">
            <div className="mb-12 lg:mb-24">
                <blockquote className="text-lg lg:text-xl leading-relaxed">
                    "This platform streamlined all my social media interactions into one place. Truly a game-changer for my productivity!"
                </blockquote>
                <div className="mt-4">
                    <p className="text-gray-400">Alex Johnson</p>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Login; 