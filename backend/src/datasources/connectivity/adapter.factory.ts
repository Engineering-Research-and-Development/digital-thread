import { IConnectivityAdapter } from './connectivity.interface'
import { HttpAdapter } from './http.adapter'
import { MqttAdapter } from './mqtt.adapter'
import { OpcUaAdapter } from './opcua.adapter'
import { SqlAdapter } from './sql.adapter'

export function createAdapter(
  protocol: string | null | undefined,
  endpoint: string,
  authConfig: any,
  protocolConfig: any,
): IConnectivityAdapter {
  switch ((protocol ?? 'HTTP').toUpperCase()) {
    case 'MQTT':   return new MqttAdapter(endpoint, authConfig, protocolConfig)
    case 'OPC_UA': return new OpcUaAdapter(endpoint, authConfig, protocolConfig)
    case 'SQL':    return new SqlAdapter(endpoint, authConfig, protocolConfig)
    case 'HTTP':
    case 'HTTPS':
    default:
      return new HttpAdapter(endpoint, authConfig, protocolConfig)
  }
}
