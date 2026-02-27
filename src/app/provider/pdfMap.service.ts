import { Injectable } from '@angular/core';
import { CampoEstructura, EstructuraFormularioAPI } from '../interface/employees.interface';


@Injectable({ providedIn: 'root' })
export class PdfMapService {

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
   * Toma el molde de la API y lo llena con los datos extraídos de AWS
   */
  public fillFormWithPdfData(pdfResponse: any, formStructure: any): any {
    
    if (!pdfResponse || !formStructure) {
      return formStructure;
    }

    // 1. Convertimos la respuesta de AWS en un Diccionario { "Nombre Campo": "Valor" }
    const camposAws = pdfResponse.result?.resultsByPage?.[0]?.fields || [];
    const diccionarioAws: Record<string, string> = {};
    
    camposAws.forEach((item: any) => {
      if (item.field && item.value) {
        diccionarioAws[item.field] = item.value;
      }
    });

    // 2. Función para inyectar los valores en las secciones de tu API
    const inyectarValores = (seccionData: any[]) => {
      if (!seccionData) return;
      
      seccionData.forEach(item => {
        const idDelCampo = item.fields?.labelId;
        const nombreEnAws = this.EQUIVALENCIAS[idDelCampo];

        // Si existe en nuestra tabla y AWS lo encontró, lo inyectamos
        if (nombreEnAws && diccionarioAws[nombreEnAws]) {
          item.valueField = diccionarioAws[nombreEnAws];
        }

        // 🌟 Regla Especial: Forzar selección de NIT si detectamos que es un RUT
        if (idDelCampo === 'identification' && diccionarioAws['5. Número de Identificación Tributaria (NIT)']) {
          item.valueField = 'NIT';
        }
      });
    };

    // 3. Aplicamos la inyección a ambas secciones (lectura y escritura) y devolvemos el molde lleno
    inyectarValores(formStructure.allowedToRead?.data);
    inyectarValores(formStructure.isAllowedToWrite?.data);

    return formStructure;
  }
}