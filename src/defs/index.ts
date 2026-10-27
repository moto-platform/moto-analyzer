import platformDbc from '../../external/vehicle-defs/dbc/platform.dbc?raw';
import vehicleDbc from '../../external/vehicle-defs/dbc/cl250.dbc?raw';
import vehicleYaml from '../../external/vehicle-defs/uds/vehicle_cl250.yaml?raw';
import obdCatalogYaml from '../../external/vehicle-defs/uds/obd_catalog.yaml?raw';
import iso14229Yaml from '../../external/vehicle-defs/uds/iso14229.yaml?raw';
import derivedYaml from '../../external/vehicle-defs/derived/cl250_derived.yaml?raw';
import limitsYaml from '../../external/vehicle-defs/limits/platform_limits.yaml?raw';
import { buildDefs, Defs } from './model';

export * from './model';

/** The pinned vehicle-defs copy, bundled at build time (git submodule at a tag). */
export const DEFS: Defs = buildDefs({
  ref: __DEFS_REF__,
  platformDbc,
  vehicleDbc,
  vehicleYaml,
  obdCatalogYaml,
  iso14229Yaml,
  derivedYaml,
  limitsYaml,
});
