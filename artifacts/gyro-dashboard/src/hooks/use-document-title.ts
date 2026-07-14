import { useEffect } from "react";
import {
  useGetConnectivity,
  getGetConnectivityQueryKey,
  ConnectivityStatus,
} from "@workspace/api-client-react";

function formatTitle(data: ConnectivityStatus | undefined): string {
  if (!data) return "Gyro Monitor";
  const { mode, connected, ip, port, ssid, bleDevice } = data;
  if (mode === "usb" && connected) {
    return `Gyro Monitor · ${port ?? "USB"}`;
  }
  if (mode === "wifi_sta" && connected) {
    return `Gyro Monitor · ${ip ?? "WiFi"}`;
  }
  if (mode === "wifi_ap") {
    return `Gyro Monitor · ${ssid ?? "AP"}`;
  }
  if (mode === "ble" && connected) {
    return `Gyro Monitor · ${bleDevice ?? "BLE"}`;
  }
  return "Gyro Monitor · No link";
}

export function useDocumentTitle() {
  const { data } = useGetConnectivity({
    query: { refetchInterval: 3000, queryKey: getGetConnectivityQueryKey() },
  });

  useEffect(() => {
    document.title = formatTitle(data);
  }, [data]);
}
