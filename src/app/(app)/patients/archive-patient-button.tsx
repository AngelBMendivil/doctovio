"use client";

import { Button } from "@/components/ui/button";
import { archivePatientAction } from "@/lib/actions/patients";

export function ArchivePatientButton({ patientId, name }: { patientId: string; name: string }) {
  return (
    <form
      action={archivePatientAction}
      onSubmit={(e) => {
        if (!confirm(`¿Dar de baja a ${name}? Dejará de aparecer en la lista (su historial se conserva).`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="patientId" value={patientId} />
      <Button type="submit" variant="ghost" size="sm" className="text-red-600 hover:bg-red-50">
        Dar de baja
      </Button>
    </form>
  );
}
