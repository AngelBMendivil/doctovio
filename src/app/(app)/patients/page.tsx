import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { listPatients } from "@/lib/services/patients";
import { calculateAge } from "@/lib/utils/age";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArchivePatientButton } from "./archive-patient-button";

export default async function PatientsPage({ searchParams }: { searchParams: { q?: string; page?: string } }) {
  const session = await getSession();
  if (!session) return null;

  const canArchive = session.role === "ADMIN" || session.role === "DOCTOR";
  const page = Number(searchParams.page || 1);
  const { items, total, totalPages } = await listPatients(session.organizationId, {
    search: searchParams.q,
    page,
    pageSize: 20,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Pacientes</h1>
          <p className="text-sm text-muted-foreground">{total} pacientes registrados</p>
        </div>
        <Link href="/patients/new">
          <Button>Nuevo paciente</Button>
        </Link>
      </div>

      <form className="max-w-sm">
        <Input name="q" defaultValue={searchParams.q} placeholder="Buscar por nombre, expediente o teléfono..." />
      </form>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Expediente</th>
                <th className="p-3">Nombre</th>
                <th className="p-3">Edad</th>
                <th className="p-3">Teléfono</th>
                <th className="p-3">Estatus</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="p-3">
                    <Link href={`/patients/${p.id}`} className="text-primary hover:underline">
                      {p.recordNumber}
                    </Link>
                  </td>
                  <td className="p-3">
                    {p.firstName} {p.lastLastName} {p.secondLastName}
                  </td>
                  <td className="p-3">{calculateAge(p.birthDate)}</td>
                  <td className="p-3">{p.phone || "—"}</td>
                  <td className="p-3">
                    <Badge tone={p.status === "ACTIVE" ? "success" : "default"}>{p.status}</Badge>
                  </td>
                  <td className="p-3 text-right">
                    {canArchive && (
                      <ArchivePatientButton
                        patientId={p.id}
                        name={`${p.firstName} ${p.lastLastName}`}
                      />
                    )}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    No se encontraron pacientes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex gap-2">
          {Array.from({ length: totalPages }).map((_, i) => (
            <Link key={i} href={`/patients?page=${i + 1}${searchParams.q ? `&q=${searchParams.q}` : ""}`}>
              <Button variant={page === i + 1 ? "primary" : "outline"} size="sm">
                {i + 1}
              </Button>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
