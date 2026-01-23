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
