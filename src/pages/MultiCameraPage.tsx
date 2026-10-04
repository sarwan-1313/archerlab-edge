import { AppIcon } from '../components/AppIcon';
import { PageHeader } from '../components/PageHeader';
export function MultiCameraPage() {
  return <div className="page-container"><PageHeader title="Multi-Camera Array" subtitle="Additional camera pairing is not available in this version." /><section className="empty-state"><AppIcon name="camera" size={28} /><h2>Use one local camera</h2><p>Live Analysis supports a single camera. Device pairing and synchronized multi-camera feeds are not implemented.</p></section></div>;
}
