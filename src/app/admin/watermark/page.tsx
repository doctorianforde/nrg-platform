import { requireRole } from "@/lib/auth/session";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/Card";
import { WatermarkReveal } from "@/components/admin/WatermarkReveal";

export const dynamic = "force-dynamic";

export default async function WatermarkPage() {
  const { user, profile } = await requireRole("admin", "/admin/watermark");
  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title="Reveal a watermark"
      eyebrow="Administration"
      subtitle="Found NRG questions posted somewhere? Load the screenshot to see which student account it came from."
    >
      <Card className="motion-safe:animate-rise-in">
        <WatermarkReveal />
      </Card>
    </DashboardShell>
  );
}
