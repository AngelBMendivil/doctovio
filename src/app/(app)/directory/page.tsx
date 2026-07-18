import { getSession } from "@/lib/auth/session";
import { searchDirectory } from "@/lib/services/directory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export default async function DirectoryPage({ searchParams }: { searchParams: { name?: string; specialty?: string; city?: string } }) {
  const session = await getSession();
  if (!session) return null;

  const doctors = await searchDirectory({
    name: searchParams.name,
    specialty: searchParams.specialty,
    city: searchParams.city,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Directorio médico</h1>

      <form className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Input name="name" placeholder="Nombre" defaultValue={searchParams.name} />
        <Input name="specialty" placeholder="Especialidad" defaultValue={searchParams.specialty} />
        <Input name="city" placeholder="Ciudad" defaultValue={searchParams.city} />
      </form>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {doctors.map((d) => (
          <Card key={d.id}>
            <CardHeader>
              <CardTitle>{d.user.fullName}</CardTitle>
              <p className="text-sm text-muted-foreground">{d.specialty || "Medicina general"} {d.subspecialty ? `· ${d.subspecialty}` : ""}</p>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>{d.organization.name}</p>
              <p className="text-muted-foreground">{d.city || "—"}, {d.state || "—"}</p>
              <p className="text-muted-foreground">{d.modality || "No especificado"}</p>
              {d.acceptsReferrals && <Badge tone="success">Acepta referencias</Badge>}
            </CardContent>
          </Card>
        ))}
        {doctors.length === 0 && <p className="text-sm text-muted-foreground">Sin resultados.</p>}
      </div>
    </div>
  );
}
