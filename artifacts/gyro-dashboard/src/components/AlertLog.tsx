import React, { useEffect, useState } from "react";
import type { Alert } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { Activity } from "lucide-react";

interface AlertLogProps {
  alerts: Alert[];
  latestAlert: Alert | null;
}

export function AlertLog({ alerts, latestAlert }: AlertLogProps) {
  const [log, setLog] = useState<Alert[]>([]);

  useEffect(() => {
    setLog(alerts);
  }, [alerts]);

  useEffect(() => {
    if (latestAlert) {
      setLog(prev => [latestAlert, ...prev].slice(0, 50)); // keep last 50
    }
  }, [latestAlert]);

  return (
    <Card className="bg-card border-border flex flex-col h-full min-h-0">
      <CardHeader className="py-2 px-3 border-b border-border bg-muted/30 shrink-0">
        <CardTitle className="text-[10px] tracking-wider text-muted-foreground flex items-center gap-2">
          <Activity className="w-3 h-3" />
          Events
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 overflow-y-auto flex-1 min-h-0">
        {log.length === 0 ? (
          <div className="p-3 text-[10px] text-muted-foreground font-mono">No events yet</div>
        ) : (
          <div className="divide-y divide-border">
            {log.map(alert => (
              <div key={alert.id} className="p-2 text-[10px] font-mono hover:bg-muted/20 transition-colors flex gap-2 items-center">
                <span className="text-muted-foreground shrink-0 w-14">
                  {format(new Date(alert.timestamp), 'HH:mm:ss')}
                </span>
                <div className="flex items-center gap-1 w-20 shrink-0">
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    alert.level === 'emergency' ? 'bg-red-500 animate-pulse' :
                    alert.level === 'critical'  ? 'bg-destructive' :
                    alert.level === 'error'     ? 'bg-orange-500' :
                    alert.level === 'warning'   ? 'bg-chart-2' : 'bg-chart-1'
                  }`} />
                  <span className="capitalize font-bold text-foreground">
                    {alert.level}
                  </span>
                </div>
                <span className="text-foreground break-words">{alert.message}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
