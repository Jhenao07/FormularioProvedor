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

interface CampoDinamico {
  key: string;
  label: string;
  isLong: boolean;
  type: string;      // 🟢 Obligatorio para el Switch
  options?: string[]; // 🟢 Opcional para el ngFor
}
