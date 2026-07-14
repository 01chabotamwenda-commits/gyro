import React from "react";
import { useGetSdCardStatus, useSyncSdCard, useToggleSdCard } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetSdCardStatusQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HardDrive, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { format } from "date-fns";

export function SdCardPanel() {
  const queryClient = useQueryClient();
  const { data: sd } = useGetSdCardStatus({ query: { refetchInterval: 2000, queryKey: getGetSdCardStatusQueryKey() } });
  const syncMutation = useSyncSdCard();
  const toggleMutation = useToggleSdCard();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetSdCardStatusQueryKey() });

  function handleSync() {
    syncMutation.mutate(undefined, { onSuccess: invalidate });
  }

  function handleToggle() {
    toggleMutation.mutate(undefined, { onSuccess: invalidate });
  }

  const isConnected = sd?.connected ?? false;
  const pending = sd?.syncPending ?? false;
  const recordsOnCard = sd?.recordsOnCard ?? 0;
  const totalSynced = sd?.totalSynced ?? 0;

  return (
    <Card className="bg-card border-border/70 shadow-sm shrink-0">
      <CardHeader className="py-2 px-3 border-b border-border/70 bg-muted/30">
        <CardTitle className="text-[10px] tracking-wider text-muted-foreground flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <HardDrive className="w-3 h-3" />
            <span>SD Card Storage</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-chart-3' : 'bg-muted-foreground'}`} />
            <span className={isConnected ? 'text-chart-3 font-semibold' : 'text-muted-foreground'}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-background rounded border border-border/70 p-2">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">On card</p>
            <p className={`text-sm font-mono font-bold ${pending ? 'text-chart-2' : 'text-foreground'}`}>
              {recordsOnCard.toLocaleString()}
            </p>
            {pending && <p className="text-[9px] text-chart-2 mt-0.5">pending sync</p>}
          </div>
          <div className="bg-background rounded border border-border/70 p-2">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Synced</p>
            <p className="text-sm font-mono font-bold text-foreground">{totalSynced.toLocaleString()}</p>
          </div>
        </div>

        {sd?.lastSyncAt && (
          <p className="text-[10px] text-muted-foreground">
            Last sync: {format(new Date(sd.lastSyncAt), 'HH:mm:ss')}
          </p>
        )}

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-[10px] font-semibold border-border"
            onClick={handleSync}
            disabled={!isConnected || syncMutation.isPending || recordsOnCard === 0}
          >
            <RefreshCw className={`w-3 h-3 mr-1.5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            {syncMutation.isPending ? 'Syncing...' : 'Sync now'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[10px] text-muted-foreground hover:text-foreground border border-border"
            onClick={handleToggle}
            disabled={toggleMutation.isPending}
            title={isConnected ? 'Simulate disconnect' : 'Simulate reconnect'}
          >
            {isConnected ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
          </Button>
        </div>

        {!isConnected && recordsOnCard > 0 && (
          <p className="text-[10px] text-chart-2 leading-tight">
            {recordsOnCard.toLocaleString()} records stored offline. Reconnect to sync.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
