export type TemplateConfig = {
  header: {
    showLogo: boolean;
    showClinicName: boolean;
    showDoctorName: boolean;
    showSpecialty: boolean;
    showAddress: boolean;
    showLicense: boolean;
    showSpecialtyLicense: boolean;
    showPhone: boolean;
    showEmail: boolean;
    align: "left" | "center";
    extraText: string;
  };
  showDiagnosis: boolean;
  showAllergies: boolean;
  paperSize: "full" | "half";
  footer: {
    showPhone: boolean;
    showEmail: boolean;
    showWebsite: boolean;
    showWhatsapp: boolean;
    align: "left" | "center";
    customText: string;
  };
};

export const DEFAULT_TEMPLATE: TemplateConfig = {
  header: {
    showLogo: true, showClinicName: true, showDoctorName: true, showSpecialty: true,
    showAddress: true, showLicense: true, showSpecialtyLicense: true, showPhone: true,
    showEmail: true, align: "center", extraText: "",
  },
  showDiagnosis: true,
  showAllergies: true,
  paperSize: "full",
  footer: { showPhone: true, showEmail: true, showWebsite: true, showWhatsapp: false, align: "center", customText: "" },
};
