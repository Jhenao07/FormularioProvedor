import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, Observable, of, throwError } from 'rxjs';
import { EmployeesResponse } from './interface/employees.interface';

@Injectable({
  providedIn: 'root'
})
export class services {

  // ── URLs ────────────────────────────────────────────────────────────────
  private apiUrl          = 'https://ccwhqcbjae.execute-api.us-east-1.amazonaws.com/api/plumbing/employees/getEmployeeByParam';
  private apiValidarOrden = 'https://ccwhqcbjae.execute-api.us-east-1.amazonaws.com/api/ntp/commercialOperation/v1/validateOpenSO/';
  private invitedUrl      = 'https://ccwhqcbjae.execute-api.us-east-1.amazonaws.com/api/ntp/commercialOperation/v1/createCompleteOrder/SR';
  private saveProviderUrl = 'https://ccwhqcbjae.execute-api.us-east-1.amazonaws.com/api/ntp/commercialOperation/v1/serviceOrder/setValueFieldToServiceOrder';
  private uploadFileUrl   = 'https://ccwhqcbjae.execute-api.us-east-1.amazonaws.com/api/ntp/commercialOperation/v1/serviceOrder/uploadFileToServiceOrder';
  private extractUrl      = 'https://3l5btwx64e.execute-api.us-east-1.amazonaws.com/api/pdf-services/pdf-extract-fields/extract-rut';
  private statusUrl       = 'https://3l5btwx64e.execute-api.us-east-1.amazonaws.com/api/pdf-services/pdf-extract-fields/extract/status';
  private extractQrUrl    = 'https://3l5btwx64e.execute-api.us-east-1.amazonaws.com/api/pdf-services/pdf-extract-qr/extract';

  // ── Tokens ──────────────────────────────────────────────────────────────
  // Token para servicios PDF (extract, status, QR)
  private readonly pdfToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjczM2VhNDNhLTc4N2QtNDM4Yi04ZTAwLTU0ZDc0YjVlMGRkOSIsImRhdGEiOiIzMzY0MDBlZWI0MWVjYzAwYWMwYmVkODZlNjk2YTk5OSIsInR5cGUiOiJ1c2VyIiwiaWF0IjoxNzY4NjkzMTM2LCJleHAiOjIwODQyNjkxMzZ9.qZn1fMZMfxJvx90t6huKa_saFKzBKYpU0MrBzpVonMY';

  // Token para servicios de negocio (crear orden, guardar datos, subir archivos)
  private readonly bizToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjExM2UyNDNjLTczZjctNGM4NC05MDE1LWU3NWRkZGFiZDI3MSIsImRhdGEiOiIyN2VmOWRiOTg0OTNhYzBiYjFkMmQ1YjJhYjVhZWFjMWViZjY1NDFhYjE4NGVmNTdmYzU3MGFkZmJhM2M1ODY3ODNmMjBhZjg0ZmQ5Y2ZmYWU3NzljYTY5NmRjMDRlZDFjODRiMzRiZjQyNWU4MTJjMDI3MmZmYjdlNTA1Yjg1YjgxNDFmMzc5NGIzNmEyNTEwYjBmODE4Njg0MzhmZGQ0YWUxYmJiMzJiZjIzMDg3OWRmZWQwMDIwYTJjYzdjOTQ0YjhhNGYxYzM0NDA1ZTRhNWRiY2I0NzA4NTc1NzFhZTYxMWZlMWQyYjYzM2YzNWNkMmExZjMyODI5OTljN2FjZjI4MjNiZjJmOTA1N2JiNDZjZjFlMzExNzg2MDQ0ZWZlOGNkYjA5YmM2YzliMjdlNmEyZDYyYjBhNzFjZjcyNGRhY2I2NGJmNzI4MTZkNmQ0ZTJjYTA1NzRmZjJiYjljODc3ZWJkMjhkNzZhZDMzMDA1NzlmMGZmYTlhMTliYWU2M2UwZWJiN2VmZGFhYTlhNjI4NDEzMGJlMzU5MmY3M2Q3ODIwYzQ0MTg2ZGEzMmNlMzBiNzJhYTc2MDIyYWMzZWVlYjI5MDRlNWNlZWU1YTI5OGQxYTIwNzAwZTM3NWFiMWRkMWEzMzcyMjU3NjFjOGIzMTRlOTE0MzM4MzgzMWVkNDJkZmFkNWQwOGMwOTRkZDg1ZDY4YTU4NTAwYmYzZTY5YWEzMmYyN2IyNjU0ZTBiOWI3MzUyMmU5Njc3MzRlZWNiZTUxMTIwMWJmOTFjY2RkOTJlMGQxMjE5YjFjNTFhZGRhODk0Y2U0ZjQ3ODhjODg5YjkwZTllYmY2YmM1OTlhZDkwZDdhNWY2YWQ4YjJkM2ViYzRmN2ZhMWMzZmEwNDJhMWRlOTAwNjhjN2U2YjEyNjhjZTlkNjdmZGUyYWQwMWNmMjg1N2Q2OWNiNDQ2NTIxNThjYzlkZmQ3YWI5MDNkM2Q5YTZmYmQ5N2Q4MDVhYzc4MDI5NTlhY2ZjZDZjMmQwMThlZTdmYzJjMDRkOGNmNzFjNDRlZTlhNGZhNjY1MDM4YjQyZjcwZTQ4NTAwZGNkMTliYTA5MzM0MzZlOWFkYWYxYzlmOWJlYzM0ZjQ2NDY1NmI0YzJhZjg4YTYyNWI5ZTZmNzcyZTNhYTFkMTZhNDU3YzdjZWFhOWU0ZTQ5N2ZhY2Y0YmRkNmVmZWI2NDMzYTNkZDNmY2FiNDBkZmM4NTViOThkMTI2ZmY5ZmIyMWJiZDBmMTcwNzgyYjEyZjQ0ODk5OGQwZGQ1NDk1YjMzODU3ODViMjU1MmU1YmZhMTUyMDhmNGNiNzhjMTc4ZmNhNDkxYjhhZTc5ZDliOTA3NDk3MTkwYjRhZThkZTIzNmQ4MDExMGMzMWZhYTRiMGVlNzlhNTVkMDhiZGQ4MGE3NjZiN2ExZmYyMzQzNCIsInR5cGUiOiJ1c2VyIiwiaWF0IjoxNzczNjYwNTQ2LCJleHAiOjE3NzQyNjUzNDZ9.JqMbuv_kA3CiyxA5mZmuk17Ha2jUTR5vuH1oTR031Ko';

  constructor(private http: HttpClient) {}

  // ── Crear invitación ─────────────────────────────────────────────────────
  createInvitation(payload: any): Observable<any> {
    console.log('🚀 Disparando petición REAL a AWS con este payload:', payload);
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.bizToken}`
    });
    return this.http.post(this.invitedUrl, payload, { headers });
  }

  // ── Buscar empleado por documento ────────────────────────────────────────
  search(documentNumber: string): Observable<EmployeesResponse> {
    return this.http.get<EmployeesResponse>(
      `${this.apiUrl}?documentNumber=${documentNumber}`
    ).pipe(
      catchError(error => {
        console.error('Error en API:', error);
        return throwError(() => error);
      })
    );
  }

  // ── Validar estado de la orden ───────────────────────────────────────────
  validarEstadoOrden(oc: string, os: string): Observable<any> {
    const url = `${this.apiValidarOrden}?oc=${oc}&os=${os}`;
    return this.http.get<any>(url, { observe: 'response' }).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 302) {
          return of({ status: 302, body: error.error });
        }
        return throwError(() => error);
      })
    );
  }

  // ── OTP: Crear y enviar código al correo ─────────────────────────────────
  sendTokenEmail(email: string): Observable<any> {
    const url = 'https://n8n-prd-hooks.ops-nvt.com/webhook/d95669f7-d936-4976-b091-a1a9e1989e44';
    return this.http.post(url, { email }, { observe: 'response' });
  }

  // ── OTP: Validar código ingresado por el proveedor ───────────────────────
  validateTokenEmail(email: string, otp: string): Observable<any> {
    const url = 'https://n8n-prd-hooks.ops-nvt.com/webhook/f00c3c63-8ea5-4513-82f4-aefb0ee5b6d6';
    return this.http.post(url, { email, OTP: otp }, { observe: 'response' });
  }

  // ── Extracción de campos del RUT (PDF → IA) ──────────────────────────────
  startExtraction(file: File, docType: string): Observable<any> {
    const headers = new HttpHeaders({ 'Authorization': `Bearer ${this.pdfToken}` });
    const fd = new FormData();
    fd.append('file', file);
    fd.append('render', JSON.stringify({  color: false, dpi: 300, pages: 1  }));
    return this.http.post<any>(this.extractUrl, fd, { headers });
  }

  // ── Polling de estado de extracción ──────────────────────────────────────
  checkStatus(jobId: string): Observable<any> {
    const headers = new HttpHeaders({ 'Authorization': `Bearer ${this.pdfToken}` });
    return this.http.get<any>(`${this.statusUrl}?jobId=${jobId}`, { headers });
  }

  // ── Extracción de QR del RUT ──────────────────────────────────────────────
  extractQr(file: File): Observable<any> {
    const headers = new HttpHeaders({ 'Authorization': `Bearer ${this.pdfToken}` });
    const fd = new FormData();

    // 🟢 EL TRUCO MAGISTRAL: Convertimos el File a un Blob puro para que AWS no se confunda
    const blob = new Blob([file], { type: 'application/pdf' });
    fd.append('file', blob, file.name); // Le pasamos el Blob y el nombre original

    fd.append('render', JSON.stringify({ color: false, dpi: 225, pages: 1 }));

    return this.http.post<any>(this.extractQrUrl, fd, { headers });
  }


  // ── Guardar datos del proveedor en la DB ─────────────────────────────────
  saveProviderData(body: {
    idServiceOrder: string;
    dataFields: { idValueField: string; labelIdField: string; valueField: string }[];
  }): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.bizToken}`
    });
    return this.http.post<any>(this.saveProviderUrl, body, { headers });
  }

  // ── Subir archivos físicos (uno a uno) ───────────────────────────────────
  uploadProviderFile(file: File, idServiceOrder: string, fileName: string): Observable<any> {
    const headers = new HttpHeaders({ 'Authorization': `Bearer ${this.bizToken}` });
    const fd = new FormData();
    fd.append('file', file);
    fd.append('idServiceOrder', idServiceOrder);
    // Este fileName es la clave para que AWS no nos tire el error 400
    fd.append('fileName', fileName);
    return this.http.put<any>(this.uploadFileUrl, fd, { headers });
  }
}
