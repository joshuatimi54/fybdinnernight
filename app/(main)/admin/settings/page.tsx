import { requireAdmin } from "@/lib/gate";
import SettingsForm from "@/components/admin/SettingsForm";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { config } = await requireAdmin();
  return <SettingsForm config={config} />;
}
