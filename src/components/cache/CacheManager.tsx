import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Trash2, RefreshCw, Database, Clock, Users, MessageSquare } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getCacheStats, clearCacheForContact, selectCacheStats } from '@/store/slices/messageSlice';
import { messageCacheService } from '@/services/MessageCacheService';
import type { RootState, AppDispatch } from '@/store/store';
import logger from '@/utils/logger';

interface CacheManagerProps {
  className?: string;
}

const CacheManager: React.FC<CacheManagerProps> = ({ className }) => {
  const dispatch = useDispatch<AppDispatch>();
  const cacheStats = useSelector((state: RootState) => selectCacheStats(state));
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Load cache stats on mount
  useEffect(() => {
    refreshStats();
  }, []);

  const refreshStats = async () => {
    try {
      setLoading(true);
      await dispatch(getCacheStats()).unwrap();
      setLastUpdated(new Date());
    } catch (error) {
      logger.error('[CacheManager] Failed to refresh stats:', error);
      toast.error('Failed to refresh cache statistics');
    } finally {
      setLoading(false);
    }
  };

  const clearAllCache = async () => {
    try {
      setLoading(true);
      await messageCacheService.cleanup();
      await refreshStats();
      toast.success('Cache cleared successfully');
    } catch (error) {
      logger.error('[CacheManager] Failed to clear cache:', error);
      toast.error('Failed to clear cache');
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleString();
  };

  const getHitRateColor = (hitRate: number): string => {
    if (hitRate >= 80) return 'text-green-600';
    if (hitRate >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getHitRateVariant = (hitRate: number): "default" | "secondary" | "destructive" | "outline" => {
    if (hitRate >= 80) return 'default';
    if (hitRate >= 60) return 'secondary';
    return 'destructive';
  };

  return (
    <div className={`cache-manager ${className}`}>
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Message Cache Manager
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={refreshStats}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={clearAllCache}
                disabled={loading}
              >
                <Trash2 className="w-4 h-4" />
                Clear All
              </Button>
            </div>
          </div>
          {lastUpdated && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="w-4 h-4" />
              Last updated: {formatDate(lastUpdated)}
            </p>
          )}
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Cache Statistics Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium">Contacts</span>
              </div>
              <div className="text-2xl font-bold">{cacheStats.totalContacts}</div>
              <div className="text-xs text-muted-foreground">cached contacts</div>
            </div>
            
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium">Messages</span>
              </div>
              <div className="text-2xl font-bold">{cacheStats.totalMessages}</div>
              <div className="text-xs text-muted-foreground">cached messages</div>
            </div>
            
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-medium">Cache Size</span>
              </div>
              <div className="text-2xl font-bold">{formatBytes(cacheStats.cacheSize)}</div>
              <div className="text-xs text-muted-foreground">storage used</div>
            </div>
            
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <RefreshCw className="w-4 h-4 text-orange-600" />
                <span className="text-sm font-medium">Hit Rate</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`text-2xl font-bold ${getHitRateColor(cacheStats.hitRate)}`}>
                  {cacheStats.hitRate.toFixed(1)}%
                </div>
                <Badge variant={getHitRateVariant(cacheStats.hitRate)} className="text-xs">
                  {cacheStats.hitRate >= 80 ? 'Excellent' : 
                   cacheStats.hitRate >= 60 ? 'Good' : 'Poor'}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">cache efficiency</div>
            </div>
          </div>

          {/* Cache Hit Rate Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Cache Hit Rate</span>
              <span className={getHitRateColor(cacheStats.hitRate)}>
                {cacheStats.hitRate.toFixed(1)}%
              </span>
            </div>
            <Progress 
              value={cacheStats.hitRate} 
              className="h-2"
            />
            <div className="text-xs text-muted-foreground">
              Higher hit rates mean better performance and reduced network usage
            </div>
          </div>

          {/* Cache Health Indicators */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Cache Health</h4>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>Storage Usage</span>
                  <span>{((cacheStats.cacheSize / (50 * 1024 * 1024)) * 100).toFixed(1)}%</span>
                </div>
                <Progress 
                  value={(cacheStats.cacheSize / (50 * 1024 * 1024)) * 100} 
                  className="h-1"
                />
                <div className="text-xs text-muted-foreground">
                  of 50MB limit
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Last Cleanup</h4>
              <div className="text-sm">
                {cacheStats.lastCleanup ? 
                  formatDate(new Date(cacheStats.lastCleanup)) : 
                  'Never'
                }
              </div>
              <div className="text-xs text-muted-foreground">
                Automatic cleanup removes old entries
              </div>
            </div>
          </div>

          {/* Cache Actions */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-3">Cache Actions</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => messageCacheService.cleanup()}
                disabled={loading}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Run Cleanup
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={refreshStats}
                disabled={loading}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh Stats
              </Button>
            </div>
          </div>

          {/* Performance Tips */}
          <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg">
            <h4 className="text-sm font-medium mb-2 text-blue-900 dark:text-blue-100">
              Performance Tips
            </h4>
            <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
              <li>• Cache hit rates above 80% indicate optimal performance</li>
              <li>• Regular cleanup prevents excessive storage usage</li>
              <li>• Cached messages load instantly without network requests</li>
              <li>• Cache automatically expires after 30 minutes for freshness</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CacheManager; 