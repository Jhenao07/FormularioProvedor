import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class PdfMapService {

  /**
   * Tabla de Equivalencias:
   * Key: El 'labelId' que espera tu formulario dinámico.
   * Value: El nombre exacto del campo que extrae AWS del PDF.
   */
  private readonly EQUIVALENCIAS: Record<string, string> = {
    'nitId': '5. Número de Identificación Tributaria (NIT)',
    'identificationNumber': '5. Número de Identificación Tributaria (NIT)',
    'companyname': '35. Razón social',
    'department': '39. Departamento',
    'City': '40. Ciudad/Municipio',
    'address': '41. Dirección principal',
    'email': '42. Correo electrónico',
    'TelExt': '44. Teléfono 1',
    'cellphone': '45. Teléfono 2',
    'economicActivity': '46. Código'
  };

  constructor() { }

  /**
   * Función principal para realizar el match
   * @param pdfResponse Respuesta JSON que viene de AWS (statusRes)
   * @param formStructure Estructura del formulario (JSON con data de campos)
   * @returns Estructura del formulario con los 'valueField' actualizados
   */
  public fillFormWithPdfData(pdfResponse: any, formStructure: any): any {
    if (!pdfResponse || !formStructure) {
      console.warn('PdfMapService: Datos de entrada incompletos.');
      return formStructure;
    }

    // 1. Convertimos los campos del PDF en un mapa (Diccionario) para búsqueda rápida
    const fieldsFromAws = pdfResponse.result?.resultsByPage?.[0]?.fields || [];
    const pdfDataMap: Record<string, any> = {};

    fieldsFromAws.forEach((item: any) => {
      if (item.field && item.value !== null) {
        pdfDataMap[item.field] = item.value;
      }
    });

    // 2. Procesamos las secciones del formulario dinámico
    if (formStructure.allowedToRead?.data) {
      this.mapSection(formStructure.allowedToRead.data, pdfDataMap);
    }

    if (formStructure.isAllowedToWrite?.data) {
      this.mapSection(formStructure.isAllowedToWrite.data, pdfDataMap);
    }

    return formStructure;
  }

  /**
   * Método privado para recorrer y asignar valores a cada campo de una sección
   */
  private mapSection(sectionData: any[], pdfDataMap: Record<string, any>): void {
    sectionData.forEach(item => {
      const labelId = item.fields?.labelId;
      
      // Buscamos si el labelId actual tiene una equivalencia definida
      const awsFieldName = this.EQUIVALENCIAS[labelId];

      if (awsFieldName && pdfDataMap[awsFieldName]) {
        // Asignamos el valor extraído al valueField del formulario
        item.valueField = pdfDataMap[awsFieldName];
      }

      // Reglas Especiales Lógicas
      this.applySpecialRules(item, pdfDataMap);
    });
  }

  /**
   * Aplica reglas que no son match 1 a 1 (Lógica de negocio)
   */
  private applySpecialRules(item: any, pdfDataMap: Record<string, any>): void {
    const labelId = item.fields?.labelId;

    // Si el formulario tiene un selector de tipo de documento y el PDF es un NIT
    if (labelId === 'identification' && pdfDataMap['5. Número de Identificación Tributaria (NIT)']) {
      item.valueField = 'NIT';
    }
    
    // Aquí puedes agregar más reglas, por ejemplo, formatear fechas o limpiar strings
  }
}