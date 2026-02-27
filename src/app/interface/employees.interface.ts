export interface Employee {
  documentNumber: string;
  name: string;
  email: string;
  position: string;
  area: string;
  management: string;

}

export interface EmployeesResponse {
  totalRecords: number;
  users: Employee[];
}


interface PdfItem {
  docType: DocumentType
  file: File;
  name: string;
  size: number;
  previewUrl: string; // blob url
  status: 'ready' | 'uploading' | 'processing' | 'done' | 'error';
  error?: string;
  result?: any; // lo que devuelva el backend (id, mensaje, etc.)
}

// 1. Lo que te devuelve la API de Estructura (El molde vacío)
export interface EstructuraFormularioAPI {
  allowedToRead: { data: CampoEstructura[] };
  isAllowedToWrite: { data: CampoEstructura[] };
}

export interface CampoEstructura {
  id: string;
  valueField: string | null;
  fields: {
    labelName: string;
    labelId: string;
    labelType: string; // 'text', 'select', 'number'
    options: string[] | null;
    orderToGetValue: number;
  };
}

// 2. Lo que usará tu HTML para pintar cómodamente
export interface CampoDinamicoUI {
  key: string;       // El labelId (ej: 'nitId')
  label: string;     // El labelName (ej: 'NIT')
  type: string;      // 'text' o 'select'
  options: string[]; // ['C.C', 'NIT'] o vacío []
  valorFijo: string; // El valor extraído por AWS
  isLong?: boolean;
  autocompletado?: boolean; 
}
