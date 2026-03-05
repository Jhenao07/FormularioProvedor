import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, Validators, ValidatorFn, FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule, HttpHeaders } from '@angular/common/http';
import { ProgressOverlayComponent } from '../components/progress-overlay/progressOverlay.component';
import { ActivatedRoute, Router } from '@angular/router';
import { services } from '../services';
import Swal from 'sweetalert2';
import { CampoDinamicoUI } from '../interface/employees.interface';
import { PdfMapService } from './pdfMap.service'; // Asegúrate de que la ruta sea correcta
import { DynamicFieldComponent } from '../components/dynamic-field/dynamic-field.component';

interface DocConfig {
  title: string;
  key: string;
}

const COUNTRY_CONFIG: Record<string, DocConfig[]> = {
  'Colombia': [
    { title: 'RUT Actualizado', key: 'rut' },
    { title: 'Cámara de Comercio', key: 'camara' },
    { title: 'Certificación Bancaria', key: 'bancaria' }
  ],
  'Estados Unidos': [
    { title: 'Form W-9', key: 'w9' },
    { title: 'ID/Passport', key: 'identity_us' },
    { title: 'Bank Verification', key: 'bank_us' }
  ],
  'México': [
    { title: 'CSF', key: 'csf' },
    { title: 'Domicilio', key: 'domicilio_mx' },
    { title: 'INE', key: 'ine' }
  ],
  'España': [
    { title: 'NIF', key: 'nif' },
    { title: 'AEAT', key: 'aeat' },
    { title: 'IBAN', key: 'iban_es' }
  ],
  'Alemania': [
    { title: 'Steuernummer', key: 'tax_de' },
    { title: 'Handelsregisterauszug', key: 'hraz' },
    { title: 'Bankbestätigung', key: 'bank_de' }
  ]
};

@Component({
  selector: 'app-provider',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, ProgressOverlayComponent, HttpClientModule, DynamicFieldComponent, FormsModule],
  templateUrl: './provider.component.html',
  styleUrl: './provider.component.css',

})
export class ProviderComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private destroyRef = inject(DestroyRef);
  private services = inject(services);
  private pdfMapService = inject(PdfMapService); // Inyectamos el servicio de mapeo

  // --- Estado ---
  ocParam: string = '';
  osParam: string = '';
  snParam: string = '';
  numSoParam: string = '';
  currentStep = 1;
  countrySelected: string | undefined = '';
  isManualMode = false;
  providerType: 'juridica' | 'natural' = 'juridica';
  toastMessage = signal<string | null>(null);
  arrayItems = signal<DocConfig[]>([]);
  form: FormGroup;

  modalDireccionAbierto = false;
  campoDireccionActivo = '';
  direccionesTokens: { kind: string, text: string }[] = [];


  // --- Datos Dinámicos ---
  camposDinamicos: any[] = [];
  mostrarCamposBeneficiario: boolean = false;
  beneficiariosActivos: number = 0; // 🟢 Lleva el conteo de los grupos visibles
  esEmpresaJuridica: boolean = false; // 🟢 Para saber si pintamos el botón al final
  formularioEstructuraDestino: any = null; // Guardará el JSON de tu API
  loadingFormConfig = true;
  archivoSeleccionado: File | null = null;
  documentosActivos: number = 1;
  // --- Overlay UI ---
  overlayOpen = false;
  overlayTitle = '';
  overlaySubtitle: string | null = null;
 fileInput: HTMLInputElement | undefined;

  constructor( private cdr: ChangeDetectorRef) {
    // Inicializamos TODO el formulario desde el principio de forma segura
    this.form = this.fb.group({
      step2_docs: this.fb.group({}),
      step3_data: this.fb.group({
        businessName: ['', Validators.required],
        nit: ['', Validators.required],
        legalRepName: ['', Validators.required],
        riskOption: ['NA', Validators.required],
        riskWhich: ['']
      }),
      formDinamico: this.fb.group({}) // Grupo vacío listo para el HTML
    });
  }

  ngOnInit() {


    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.ocParam = params['oc'] || '';
        this.osParam = params['os'] || '';
        this.numSoParam = params['numSo'] || '';
        this.currentStep = Number(params['step']) || 1;
        this.isManualMode = params['mode'] === 'manual';

        const snParam = params['sn']?.toUpperCase();

         if (this.numSoParam) {
          this.cargarEstructuraFormulario(this.numSoParam);
        } else {
          console.warn("No se encontró el parámetro 'numSo' en la URL.");
          this.loadingFormConfig = false;
        }

        const diccionariPaises: Record<string, string> = {
          'CO': 'Colombia',
          'US': 'Estados Unidos',
          'MX': 'México',
          'ES': 'España',
          'DE': 'Alemania'
        };

        if (snParam && diccionariPaises[snParam]) {
          this.countrySelected = diccionariPaises[snParam];
        } else {
          this.countrySelected = 'Otro';
        }

        if (!this.countrySelected || this.countrySelected === 'Otro') {
          this.arrayItems.set([]);
        }

        if (this.currentStep === 1 && this.countrySelected && this.countrySelected !== 'Otro') {
          const config = COUNTRY_CONFIG[this.countrySelected] || [];
          this.arrayItems.set(config);
          this.rebuildStep2Docs(config);
        }

      });
  }

  cargarEstructuraFormulario(numeroOrden: string) {
    this.loadingFormConfig = true;

    const apiUrl = `https://ccwhqcbjae.execute-api.us-east-1.amazonaws.com/api/ntp/commercialOperation/v1/serviceOrder/getFieldsByServiceOrder/${numeroOrden}`;

    // 1. Ponemos el token directamente como variable (igual que en tu service)
    const apiToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjExM2UyNDNjLTczZjctNGM4NC05MDE1LWU3NWRkZGFiZDI3MSIsImRhdGEiOiIyN2VmOWRiOTg0OTNhYzBiYjFkMmQ1YjJhYjVhZWFjMWViZjY1NDFhYjE4NGVmNTdmYzU3MGFkZmJhM2M1ODY3ODNmMjBhZjg0ZmQ5Y2ZmYWU3NzljYTY5NmRjMDRlZDFjODRiMzRiZjQyNWU4MTJjMDI3MmZmYjdlNTA1Yjg1YjgxNDFmMzc5NGIzNmEyNTEwYjBmODE4Njg0MzhmZGQ0YWUxYmJiMzJiZjIzMDg3OWRmZWQwMDIwYTJjYzdjOTQ0YjhhNGYxYzM0NDA1ZTRhNWRiY2I0NzA4NTc1NzFhZTYxMWZlMWQyYjYzM2YzNWNkMmExZjMyODI5OTljN2FjZjI4MjNiZjJmOTA1N2JiNDZjZjFlMzExNzg2MDQ0ZWZlOGNkYjA5YmM2YzliMjdlNmEyZDYyYjBhNzFjZjcyNGRhY2I2NGJmNzI4MTZkNmQ0ZTJjYTA1NzRmZjJiYjljODc3ZWJkMjhkNzZhZDMzMDA1NzlmMGZmYTlhMTliYWU2M2UwZWJiN2VmZGFhYTlhNjI4NDEzMGJlMzU5MmY3M2Q3ODIwYzQ0MTg2ZGEzMmNlMzBiNzJhYTc2MDIyYWMzZWVlYjI5MDRlNWNlZWU1YTI5OGQxYTIwNzAwZTM3NWFiMWRkMWEzMzcyMjU3NjFjOGIzMTRlOTE0MzM4MzgzMWVkNDJkZmFkNWQwOGMwOTRkZDg1ZDY4YTU4NTAwYmYzZTY5YWEzMmYyN2IyNjU0ZTBiOWI3MzUyMmU5Njc3MzRlZWNiZTUxMTIwMWJmOTFjY2RkOTJlMGQxMjE5YjFjNTFhZGRhODk0Y2U0ZjQ3ODhjODg5YjkwZTllYmY2YmM1OTlhZDkwZDdhNWY2YWQ4YjJkM2ViYzRmN2ZhMWMzZmEwNDJhMWRlOTAwNjhjN2U2YjEyNjhjZTlkNjdmZGUyYWQwMWNmMjg1N2Q2OWNiNDQ2NTIxNThjYzlkZmQ3YWI5MDNkM2Q5YTZmYmQ5N2Q4MDVhYzc4MDI5NTlhY2ZjZDZjMmQwMThlZTdmYzJjMDRkOGNmNzFjNDRlZTlhNGZhNjY1MDM4YjQyZjcwZTQ4NTAwZGNkMTliYTA5MzM0MzZlOWFkYWYxYzlmOWJlYzM0ZjQ2NDY1NmI0YzJhZjg4YTYyNWI5ZTZmNzcyZTNhYTFkMTZhNDU3YzdjZWFhOWU0ZTQ5N2ZhY2Y0YmRkNmVmZWI2NDMzYTNkZDNmY2FiNDBkZmM4NTViOThkMTI2ZmY5ZmIyMWJiZDBmMTcwNzgyYjEyZjQ0ODk5OGQwZGQ1NDk1YjMzODU3ODViMjU1MmU1YmZhMTUyMDhmNGNiNzhjMTc4ZmNhNDkxYjhhZTc5ZDliOTI5ZmE2NWJlZWZlZmQzMTg4NmUzZGVjOGViNzUzMzkiLCJ0eXBlIjoidXNlciIsImlhdCI6MTc3MjU2MDA4MiwiZXhwIjoxNzczMTY0ODgyfQ.X43wvS7zWwNkhEn6HlVlv7IQK1hNb9xMVJKDBGC-aFI';
    // 2. Armamos los headers
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${apiToken}`
    });

    // 3. Enviamos la petición GET con los headers incluidos
    this.http.get(apiUrl, { headers }).subscribe({
      next: (respuestaApi: any) => {
        console.log("✅ Estructura descargada exitosamente con Token:", respuestaApi);

        // Guardamos la respuesta real
        this.formularioEstructuraDestino = respuestaApi;
        this.loadingFormConfig = false;
      },
      error: (error) => {
        console.error("❌ Error consumiendo la API de AWS (Revisa permisos del Token):", error);
        this.loadingFormConfig = false;

        Swal.fire({
          title: 'Error de conexión',
          text: 'No se pudo cargar la estructura del formulario. Revisa la consola.',
          icon: 'error'
        });
      }
    });
  }

  mostrarToast(mensaje: string) {
    this.toastMessage.set(mensaje);
    setTimeout(() => this.toastMessage.set(null), 3000);
  }

  atLeastOneFileValidator(): ValidatorFn {
    return (control: AbstractControl) => {
      const group = control as FormGroup;
      const controls = group.controls;
      const hasFile = Object.keys(controls).some(key => controls[key].value instanceof File);
      return hasFile ? null : { noFiles: true };
    };
  }

  private rebuildStep2Docs(config: DocConfig[]) {
    const group: any = {};
    config.forEach(doc => { group[doc.key] = [null]; });
    this.form.setControl('step2_docs', this.fb.group(group, { validators: [this.atLeastOneFileValidator()] }));
  }

  onCountryChange(event: Event) {
    const element = event.target as HTMLSelectElement;
    const country = element.value;
    if (!country) return;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { step: 1, sn: country }, // Agregamos o actualizamos el país
      queryParamsHandling: 'merge',          // 🟢 LA MAGIA: Conserva el numSo, oc, os
      replaceUrl: true
    });

    this.arrayItems.set([]);
    this.form.get('step2_docs')?.reset();
  }

  goToStep(step: number) {
    if (this.currentStep === 2 && step === 3) {
      const docsGroup = this.form.get('step2_docs');
      if (docsGroup?.invalid) {
        docsGroup.markAllAsTouched();
        return;
      }
    }
    this.router.navigate([], { relativeTo: this.route, queryParams: { step: step }, queryParamsHandling: 'merge' });
  }

  irARegistroManual() {
    this.router.navigate([], { relativeTo: this.route, queryParams: { step: 3, mode: 'manual', country: 'Otro' }, queryParamsHandling: 'merge' });
  }

 prevStep() {
    if (this.currentStep === 2 || (this.currentStep === 3 && this.isManualMode)) {

      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { step: 1 },
        queryParamsHandling: 'merge', // 🟢 Conservamos el numSo al retroceder
        replaceUrl: true
      });

      this.countrySelected = undefined;
      this.isManualMode = false;
      this.arrayItems.set([]);
      this.form.get('step2_docs')?.reset();

    } else if (this.currentStep > 1) {
      this.goToStep(this.currentStep - 1);
    }
  }

onFileSelected(event: Event, docKey: string, fileInput: HTMLInputElement) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const control = this.form.get('formDinamico')?.get(docKey);

      // 🟢 1. NUEVA LÓGICA: Calcular el nombre a mostrar (Renombramiento inteligente)
      let nombreParaMostrar = file.name; // Nombre original por defecto

      // Extraemos la extensión (ej. pdf, png)
      const partesNombre = file.name.split('.');
      const extension = partesNombre.length > 1 ? partesNombre.pop() : '';

      // -------------------------------------------------------------------------
      // 🟢 INTEGRACIÓN PARA LA SÚPER CAJA: Averiguar qué número de documento estamos subiendo
      const matchNum = docKey.match(/\d+/);
      const numDoc = matchNum ? matchNum[0] : '1';

      let campoSistemaGestion: any = null;

      if (numDoc === '1') {
        // Si es el documento 1, buscamos el Select original que está "suelto" en la grilla
        campoSistemaGestion = this.camposDinamicos.find(c =>
          (c.label.toLowerCase().includes('tipo de sistema de gestión') ||
           c.label.toLowerCase().includes('tipo de sistema')) &&
          !c.key.includes('_clon') &&
          c.type !== 'documento-agrupado'
        );
      } else {
        // Si es documento 2 en adelante, buscamos su Súper Caja y sacamos el Select de adentro
        const cajaAgrupada = this.camposDinamicos.find(c =>
          c.type === 'documento-agrupado' &&
          c.key === `agrupado_${numDoc}`
        );

        if (cajaAgrupada && cajaAgrupada.selectConfig) {
          campoSistemaGestion = cajaAgrupada.selectConfig;
        }
      }
      // -------------------------------------------------------------------------

      // Si encontramos el Select y tiene un valor seleccionado, armamos el nuevo nombre
      if (campoSistemaGestion) {
        const valorSelect = this.form.get('formDinamico')?.get(campoSistemaGestion.key)?.value;
        if (valorSelect && String(valorSelect).trim() !== '') {
          nombreParaMostrar = `${valorSelect}.${extension}`;
        }
      }

      // Guardamos el archivo físico en el paso 2
      this.form.get(`step2_docs.${docKey}`)?.setValue(file);
      this.form.get('step2_docs')?.updateValueAndValidity();

      // Aquí reemplazamos 'file.name' por 'nombreParaMostrar'
      this.form.get('formDinamico')?.get(docKey)?.setValue(nombreParaMostrar);
      this.cdr.detectChanges();

      if (control) {
        // 2. Seteamos el valor (el nuevo nombre del archivo)
        control.setValue(nombreParaMostrar);

        // 3. Marcamos como sucio y tocado para que la UI reaccione
        control.markAsDirty();
        control.markAsTouched();

        // 4. Actualizamos validez (esto dispara el renderizado en componentes dinámicos)
        control.updateValueAndValidity();

        console.log(`✅ Archivo renombrado inyectado en ${docKey}:`, control.value);
      }

      // 5. Forzamos la detección de cambios global del componente
      this.cdr.detectChanges();
    }
  }
  eliminarDocumentoAdjunto(controlName: string, fileInput: HTMLInputElement) {
    // 1. Vaciamos el texto del input visual
    this.form.get('formDinamico')?.get(controlName)?.setValue('');

    // 2. Reseteamos el input oculto para que permita volver a seleccionar el mismo archivo si es necesario
    fileInput.value = '';

    // 3. (Opcional) Eliminarlo de tu arreglo de archivos a enviar al backend
    // delete this.archivosFisicos[controlName];
  }

 removeFile(docKey: string = '', fileInput?: HTMLInputElement) {
  // 1. Limpieza para el Paso 1 (Documentos iniciales)
  if (this.currentStep === 1) {
    this.form.get(`step2_docs.${docKey}`)?.setValue(null);
    this.form.get('step2_docs')?.updateValueAndValidity();
  }

  // 2. Limpieza para el Paso 2 (Formulario dinámico de la imagen)
  if (this.currentStep === 2) {
    // 🟢 Esto es lo que limpia el input rojo que se ve en tu imagen
    this.form.get('formDinamico')?.get(docKey)?.setValue('');
  }

  // 3. Resetear el input físico (para permitir correcciones)
  if (fileInput) {
    fileInput.value = '';
  } else {
    const el = document.getElementById('file-' + docKey) as HTMLInputElement;
    if (el) el.value = '';
  }

  // 4. Si es un error crítico que requiere volver al inicio, mantenemos tu lógica
  // Pero si solo es borrar un documento extra, no deberíamos resetear todo el formulario
  if (this.currentStep === 1) {
    this.camposDinamicos = [];
    this.form.setControl('formDinamico', this.fb.group({}));
    this.overlayOpen = false;
    alert("Archivo eliminado. Por favor, adjunta un documento válido.");
  }

  this.cdr.detectChanges();
}
procesarYSiguiente() {
  const docKey = 'rut';
  const file = this.form.get(`step2_docs.${docKey}`)?.value;

  if (file instanceof File) {
    // 🟢 Aseguramos estado inicial limpio
    this.overlayOpen = true;
    this.overlayTitle = 'Extrayendo Documento...';
    this.overlaySubtitle = 'Analizando datos con IA';

    // Forzamos a Angular a que pinte el overlay YA
    this.cdr.detectChanges();

    this.procesarPdf(docKey);
  } else {
    this.currentStep = 2;
  }
}

  procesarPdf(docKey: string) {
    const file = this.form.get(`step2_docs.${docKey}`)?.value;
    if (!(file instanceof File)) return;

    this.overlayOpen = true;
    this.overlayTitle = 'Extrayendo Documento...';

    const fd = new FormData();
    fd.append('file', file);
    fd.append('render', JSON.stringify({ "dpi": 200, "pages": "1" }));

    this.services.startExtraction(file, docKey).subscribe({
      next: (data) => {
        const jobId = data.jobId;
        if (jobId) {
          this.iniciarPolling(jobId);
        } else {
          Swal.fire({
          icon: 'error',
          title: 'Error de Ticket',
          text: 'No se recibió Ticket de AWS. Intenta de nuevo.',
          confirmButtonColor: 'var(--accent)'
        });
      }
    },
    error: (err) => {
      console.error("❌ Error enviando PDF:", err);
      Swal.fire({
        icon: 'error',
        title: 'Error de conexión',
        text: 'Error de conexión con AWS.',
        confirmButtonColor: 'var(--accent)'
      });
    }
    });
  }
iniciarPolling(jobId: string, intentos: number = 0) {
  // 1. SEGURO DE VIDA: Si intenta más de 20 veces (aprox 1.5 minutos), lo detenemos.
  if (intentos > 20) {
    this.overlayOpen = false;
    this.cdr.detectChanges();
    Swal.fire({
      icon: 'warning',
      title: 'Tiempo agotado',
      text: 'El procesamiento está tardando demasiado. Por favor, borra el archivo e intenta subirlo de nuevo.',
      confirmButtonColor: 'var(--accent)'
    });
    return; // Rompemos el ciclo
  }

  this.services.checkStatus(jobId).subscribe({
    next: (res: any) => {
      const estado = res.status ? res.status.toLowerCase() : '';
      const progreso = res.progress || 0;

      // Actualizamos el texto y forzamos a Angular a pintarlo en pantalla
      this.overlayTitle = `Analizando documento (${progreso}%)...`;
      this.cdr.detectChanges();

      if (estado === 'completed' || progreso === 100) {
        // ¡Éxito! Pasamos a la extracción (Asegúrate de que extraerDatosDelJSON cierre el overlay)
        this.extraerDatosDelJSON(res);

      } else if (estado === 'failed' || estado === 'error') {
        // Error de AWS
        this.overlayTitle = 'Error leyendo el documento en AWS';
        this.cdr.detectChanges();

        setTimeout(() => {
          this.overlayOpen = false;
          this.cdr.detectChanges(); // Forzamos el cierre visual
          Swal.fire('Error', 'AWS no pudo procesar este archivo. Intenta con uno más claro.', 'error');
        }, 1500);

      } else {
        // Sigue procesando: Volvemos a llamar a la función, pero sumando 1 al contador
        setTimeout(() => {
          this.iniciarPolling(jobId, intentos + 1);
        }, 5000);
      }
    },
    error: (err: any) => {
      console.error("Error de red en el polling:", err);

      // 2. FIX DEL BUCLE INFINITO: Si hay error de red, solo reintentamos 3 veces máximo
      if (intentos < 3) {
        setTimeout(() => { this.iniciarPolling(jobId, intentos + 1); }, 5000);
      } else {
        this.overlayOpen = false;
        this.cdr.detectChanges();
        Swal.fire({
          icon: 'error',
          title: 'Error de conexión',
          text: 'Perdimos conexión con el servidor. Borra el archivo y vuelve a intentar.',
          confirmButtonColor: 'var(--error)'
        });
      }
    }
  });
}
  agregarBeneficiario() {
    if (this.beneficiariosActivos < 10) {
      this.beneficiariosActivos++;

      // Recorremos los campos y volvemos visibles los del grupo actual
      this.camposDinamicos.forEach(campo => {
        if (campo.grupoBeneficiario === this.beneficiariosActivos) {
          campo.visible = true;
        }
      });
      this.cdr.detectChanges();
    } else {
        Swal.fire({
          icon: 'warning',
          title: 'Límite alcanzado',
          text: 'Has alcanzado el límite máximo permitido de 10 beneficiarios finales.',
          confirmButtonText: 'Entendido',
          confirmButtonColor: 'var(--accent)',
          background: 'var(--surface)',
          color: 'var(--text)',
          customClass: {
          popup: 'provider-card'
        }
      });
    }
  }
  esInicioDeBeneficiario(index: number): boolean {
  const campo = this.camposDinamicos[index];

  // Si no es un beneficiario o está oculto, ignoramos
  if (campo.grupoBeneficiario === 0 || campo.visible === false) return false;

  // Buscamos el campo VISIBLE inmediatamente anterior
  for (let i = index - 1; i >= 0; i--) {
    const campoAnterior = this.camposDinamicos[i];
    if (campoAnterior.visible !== false) {
      // Si el campo anterior pertenece a un grupo distinto (ej. el formulario normal o el beneficiario 1)
      // entonces significa que ESTE es el primer campo del nuevo beneficiario.
      return campoAnterior.grupoBeneficiario !== campo.grupoBeneficiario;
    }
  }
  return true;
}
 mostrarBotonBeneficiario(index: number): boolean {
  // 1. Si no es empresa o ya llegó a 10, no hay botón
  if (!this.esEmpresaJuridica || this.beneficiariosActivos >= 10) return false;

  const campoActual = this.camposDinamicos[index];

  // Regla de oro: El botón nunca se pinta debajo de un campo oculto
  if (campoActual.visible === false) return false;

  // 2. Si hay 0 beneficiarios activos (Aún no se ha dado clic al botón)
  if (this.beneficiariosActivos === 0) {
    // Buscamos el primer campo de beneficiario (que está oculto)
    const primerOculto = this.camposDinamicos.findIndex(c => c.grupoBeneficiario > 0);
    // Pintamos el botón exactamente debajo del campo normal que está justo antes
    if (primerOculto > 0) {
      return index === primerOculto - 1;
    }
    return false;
  }

  // 3. Si YA HAY beneficiarios activos (1, 2, 3, 4...)
  else {
    // Buscamos de atrás hacia adelante cuál es el ÚLTIMO campo de beneficiario que está VISIBLE
    let ultimoIndiceVisible = -1;

    for (let i = this.camposDinamicos.length - 1; i >= 0; i--) {
      const c = this.camposDinamicos[i];
      // Si el campo es de un beneficiario y actualmente es visible en pantalla
      if (c.grupoBeneficiario > 0 && c.visible !== false) {
        ultimoIndiceVisible = i;
        break; // Encontramos el último, paramos de buscar
      }
    }

    // El botón se pinta única y exclusivamente debajo de ese último campo
    return index === ultimoIndiceVisible;
  }
}
esInicioDeSeccion(index: number): boolean {
    const campoActual = this.camposDinamicos[index];

    // Si el campo está oculto, no inicia ninguna sección visual
    if (campoActual.visible === false) return false;

    // Buscamos hacia atrás cuál fue el ÚLTIMO campo visible
    for (let i = index - 1; i >= 0; i--) {
      const campoAnterior = this.camposDinamicos[i];
      if (campoAnterior.visible !== false) {
        // Si la sección del campo anterior es diferente a la actual, hay un quiebre
        return campoAnterior.seccion !== campoActual.seccion;
      }
    }

    // Si no encontró campos visibles antes que él, es el primerísimo campo
    return true;
  }
eliminarUltimoBeneficiario() {
  if (this.beneficiariosActivos > 0) {

    // 1. Confirmación de seguridad con Swal
    Swal.fire({
      title: '¿Quitar beneficiario?',
      text: 'Se borrarán los datos que hayas ingresado para este beneficiario.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: 'var(--error)', // Rojo para acciones destructivas
      cancelButtonColor: 'var(--surface-3)',
      confirmButtonText: 'Sí, quitar',
      cancelButtonText: 'Cancelar',
      background: 'var(--surface)',
      color: 'var(--text)',
      customClass: {
        popup: 'provider-card', // Mantiene el efecto Glassmorphism
        cancelButton: 'btn-secondary' // Usa tus clases nativas para el botón cancelar
      }
    }).then((result) => {

      if (result.isConfirmed) {
        // 2. Ocultar los campos del último grupo agregado y limpiar sus valores
        this.camposDinamicos.forEach(campo => {
          if (campo.grupoBeneficiario === this.beneficiariosActivos) {
            campo.visible = false; // Lo ocultamos de la pantalla

            // MUY IMPORTANTE: Limpiamos el valor en el formulario reactivo
            // para que no viaje al backend un dato oculto
            this.form.get('formDinamico')?.get(campo.key)?.setValue('');
          }
        });

        // 3. Restamos el contador
        this.beneficiariosActivos--;

        // 4. Forzamos la actualización de la grilla de 3 columnas
        this.cdr.detectChanges();
      }
    });
  }
}
agregarDocumento() {
    if (this.documentosActivos < 10) {
      this.documentosActivos++;

      // 1. Extraemos y eliminamos el documento oculto de su posición aleatoria
      const docIndex = this.camposDinamicos.findIndex(c => c.key === `document${this.documentosActivos}`);
      if (docIndex === -1) return;

      const docOriginal = { ...this.camposDinamicos[docIndex] };
      this.camposDinamicos.splice(docIndex, 1); // Lo quitamos temporalmente

      // 2. Buscamos el select original para clonarlo
      const selectOriginal = this.camposDinamicos.find(c =>
        (c.label.toLowerCase().includes('tipo de sistema de gestión') ||
         c.label.toLowerCase().includes('tipo de sistema')) &&
        !c.key.includes('_clon') && c.type !== 'documento-agrupado'
      );

      if (selectOriginal) {
        const nuevaLlaveSelect = `${selectOriginal.key}_clon${this.documentosActivos}`;

        const clonSelect = {
          ...selectOriginal,
          key: nuevaLlaveSelect,
          label: `${selectOriginal.label} ${this.documentosActivos}`,
          grupoDocumento: this.documentosActivos,
          visible: true
        };

        const formDinamico = this.form.get('formDinamico') as any;
        if (formDinamico && typeof formDinamico.addControl === 'function') {
           formDinamico.addControl(nuevaLlaveSelect, this.fb.control(''));
        }

        // 🟢 3. BUSCAMOS EL DOCUMENTO ANTERIOR PARA PONERNOS DEBAJO
        // Si vamos a crear el doc 2, buscamos el 1. Si vamos a crear el 3, buscamos la caja del 2.
        const llaveAnterior = this.documentosActivos === 2 ? 'document1' : `agrupado_${this.documentosActivos - 1}`;
        const indexAnterior = this.camposDinamicos.findIndex(c => c.key === llaveAnterior);

        // Heredamos la sección para no romper el diseño principal del formulario
        const seccionHeredada = indexAnterior !== -1 ? this.camposDinamicos[indexAnterior].seccion : 'Información del Proveedor';

        docOriginal.visible = true;
        docOriginal.label = `Documento ${this.documentosActivos}`;
        docOriginal.grupoDocumento = this.documentosActivos;

        // Armamos la Súper Caja
        const campoAgrupado = {
          type: 'documento-agrupado',
          key: `agrupado_${this.documentosActivos}`,
          visible: true,
          isLong: true,
          seccion: seccionHeredada, // Mantiene la sección unificada
          tituloInterno: `📁 Documento Adicional ${this.documentosActivos - 1}`, // Nuevo título interno
          selectConfig: clonSelect,
          fileConfig: docOriginal
        };

        // 🟢 4. LO INSERTAMOS EN FILA, JUSTO DEBAJO DEL ANTERIOR
        const insertIndex = indexAnterior !== -1 ? indexAnterior + 1 : this.camposDinamicos.length;
        this.camposDinamicos.splice(insertIndex, 0, campoAgrupado);
      }

      this.cdr.detectChanges();
    }
  }

async extraerDatosDelJSON(statusRes: any) {
  try {
    console.log("🚀 Iniciando extracción inteligente de RUT y Plantilla...");

    const fieldsExtraidos = statusRes.result?.resultsByPage?.[0]?.fields || [];

    // 🟢 1. REGLA DE NEGOCIO: VALIDAR VIGENCIA DEL RUT (Máximo 30 días)
    const campoFecha = fieldsExtraidos.find((f: any) => f.field === 'Fecha generación documento');

    if (campoFecha && campoFecha.value) {
      const esValido = this.validarVigenciaRut(campoFecha.value);

      if (!esValido) {
        this.overlayOpen = false;
        this.cdr.detectChanges();

        await Swal.fire({
          title: 'Documento Vencido',
          text: 'El documento tiene más de 30 días de antigüedad. Por favor, adjunta uno reciente.',
          icon: 'error',
          confirmButtonColor: 'var(--accent)',
          background: 'var(--surface)',
          color: 'var(--text)'
        });

        this.removeFile();
        this.cdr.detectChanges();
        return;
      }
    }

    // 🟢 2. ACTUALIZAR EL OVERLAY
    this.overlayTitle = 'Organizando la información...';
    this.overlaySubtitle = 'Casi listo';
    this.cdr.detectChanges();

    // 🟢 3. DETECTAR TIPO DE CONTRIBUYENTE
    const tipoContribuyenteObj = fieldsExtraidos.find((f: any) => f.field.includes('Tipo de contribuyente'));
    const esJuridica = tipoContribuyenteObj && tipoContribuyenteObj.value?.toLowerCase().includes('jurídica');
    this.esEmpresaJuridica = !!esJuridica;

    this.camposDinamicos = [];
    const controlesReactivos: { [key: string]: any } = {};

    // ⚠️ NOTA: Eliminamos el "Paso 4" (Inyectar datos crudos del PDF)
    // porque tu plantilla del Paso 5 ya trae esta información mapeada.
    // Así evitamos que la Razón Social y el NIT salgan repetidos arriba y abajo.

    // 🟢 4. INYECTAR PLANTILLA (API 2) - Lógica de columnas, filtros y SECCIONES
    if (this.formularioEstructuraDestino) {
      this.formularioEstructuraDestino = this.pdfMapService.fillFormWithPdfData(statusRes, this.formularioEstructuraDestino);

      const dataRead = this.formularioEstructuraDestino.allowedToRead?.data || [];
      const dataWrite = this.formularioEstructuraDestino.isAllowedToWrite?.data || [];
      const seccionesPlantilla = [...dataRead, ...dataWrite];

      seccionesPlantilla.forEach((itemPlantilla: any) => {
        if (itemPlantilla.fields && itemPlantilla.fields.labelId) {
          const key = itemPlantilla.fields.labelId;
          const valorExtraido = itemPlantilla.valueField;
          const fueExtraidoPorIA = valorExtraido !== null && valorExtraido !== undefined && String(valorExtraido).trim() !== '';

          let esCampoParaEsteUsuario = true;
          const camposSoloNatural = ['firstLastName', 'secondLastName', 'identification', 'identificationNumber'];
          const camposSoloJuridica = ['nitId', 'representativeName', 'nationalIdentityCard', 'riskControlSystem', 'which risk'];

          if (this.esEmpresaJuridica) {
            if (camposSoloNatural.includes(key)) esCampoParaEsteUsuario = false;
          } else {
            if (camposSoloJuridica.includes(key) || key.startsWith('finalBeneficiary')) esCampoParaEsteUsuario = false;
          }

          let esVisible = true;
          let grupoBeneficiario = 0;
          let grupoDocumento = 0;

          // 🛠️ FIX CLAVE 1: Quitamos el símbolo '$' del Regex.
          // Ahora detectará el número en "finalBeneficiary1_name" sin fallar.
          if (this.esEmpresaJuridica && key.startsWith('finalBeneficiary')) {
            const match = key.match(/\d+/);
            if (match) {
              grupoBeneficiario = parseInt(match[0], 10);
              esVisible = false; // Se ocultan hasta que el usuario le de clic al botón
            }
          }

          if (key.startsWith('document')) {
            const match = key.match(/\d+/);
            if (match) {
              grupoDocumento = parseInt(match[0], 10);
              if (grupoDocumento > this.documentosActivos) esVisible = false;
            }
          }

          if (!controlesReactivos[key] && esCampoParaEsteUsuario) {
            controlesReactivos[key] = [fueExtraidoPorIA ? valorExtraido : ''];

            // Extraemos el nombre de la sección de la plantilla
            let nombreSeccion = itemPlantilla.fields.section || itemPlantilla.section || 'Información del Proveedor';

            if (grupoBeneficiario > 0) {
              nombreSeccion = `Beneficiario Final ${grupoBeneficiario}`;
            }

            this.camposDinamicos.push({
              key: key,
              label: itemPlantilla.fields.labelName,
              type: itemPlantilla.fields.labelType || 'text',
              options: itemPlantilla.fields.options || [],
              isLong: String(itemPlantilla.fields.labelName).length > 50,
              autocompletado: fueExtraidoPorIA,
              visible: esVisible,
              grupoBeneficiario: grupoBeneficiario,
              grupoDocumento: grupoDocumento,
              seccion: nombreSeccion
            });
          }
        }
      });
    }

    // 🟢 5. ORDENAR Y AGRUPAR (El fin del desorden visual)
    const camposNormales = this.camposDinamicos.filter(c => c.grupoBeneficiario === 0);
    const camposBeneficiarios = this.camposDinamicos.filter(c => c.grupoBeneficiario > 0);

    // 🛠️ FIX CLAVE 2: Agrupamos los campos normales por su Sección para evitar títulos duplicados
    const ordenSecciones = [...new Set(camposNormales.map(c => c.seccion))];
    camposNormales.sort((a, b) => ordenSecciones.indexOf(a.seccion) - ordenSecciones.indexOf(b.seccion));

    // Ordenamos los beneficiarios
    camposBeneficiarios.sort((a, b) => a.grupoBeneficiario - b.grupoBeneficiario);

    // Unimos todo limpio
    this.camposDinamicos = [...camposNormales, ...camposBeneficiarios];

    // 🟢 6. FINALIZAR Y CERRAR OVERLAY DE FORMA SEGURA
    this.form.setControl('formDinamico', this.fb.group(controlesReactivos));

    setTimeout(() => {
      this.overlayOpen = false;
      this.currentStep = 2;
      this.cdr.detectChanges();
    }, 500);

  } catch (error) {
    console.error("Error crítico mapeando el JSON:", error);
    this.overlayOpen = false;
    this.cdr.detectChanges();

    Swal.fire({
      title: 'Error de Lectura',
      text: 'Ocurrió un problema al organizar los datos del documento. Intenta subirlo nuevamente.',
      icon: 'warning',
      confirmButtonColor: 'var(--accent)',
      background: 'var(--surface)',
      color: 'var(--text)'
    });
  }
}
  // ESTA ES LA FUNCIÓN CLAVE CORREGIDA

  validarVigenciaRut(textoFecha: string): boolean {
    if (!textoFecha) return false;

    // Busca un patrón de fecha DD-MM-YYYY en el texto
    const match = textoFecha.match(/(\d{2})-(\d{2})-(\d{4})/);
    if (!match) return false;

    const dia = parseInt(match[1], 10);
    const mes = parseInt(match[2], 10) - 1; // En JavaScript los meses van de 0 a 11
    const anio = parseInt(match[3], 10);

    const fechaRUT = new Date(anio, mes, dia);
    const fechaHoy = new Date();

    // Calculamos la diferencia en días
    const diferenciaMilisegundos = fechaHoy.getTime() - fechaRUT.getTime();
    const diasPasados = Math.floor(diferenciaMilisegundos / (1000 * 60 * 60 * 24));

    console.log(`📅 El RUT fue generado hace ${diasPasados} días.`);

    return diasPasados <= 30; // Retorna true si es válido, false si está vencido
  }



  // (Este método se usaba antes del rediseño, parece que iniciarPolling ya hace esto. Considera borrarlo si no lo usas en otro lado)
  verificarEstado(jobId: string) { /* ... */ }

  onOverlayClose() {
    this.overlayOpen = false;
  }

  submitForm() {
    this.overlayOpen = true;
    this.overlayTitle = 'Enviando información...';

    const formData = new FormData();
    formData.append('country', this.countrySelected || '');
    formData.append('oc', this.ocParam);
    formData.append('os', this.osParam);
    formData.append('sn', this.snParam);

    const datosExtraidos = this.form.get('formDinamico')?.value || {};
    formData.append('providerData', JSON.stringify(datosExtraidos));

    const docs = this.form.get('step2_docs')?.value;
    if (docs) {
      Object.keys(docs).forEach(key => {
        const file = docs[key];
        if (file instanceof File) formData.append(`document_${key}`, file);
      });
    }

    console.log("📦 CAJA FUERTE:", datosExtraidos);

    setTimeout(() => {
      this.overlayOpen = false;
      Swal.fire({ title: '¡Registro Exitoso!', text: 'Melooo!', icon: 'success' });
    }, 2000);
  }

 dianData = {
    viaInicial: 'CL', numInicial: '', nombreViaInicial: '', letraInicial: '', bisInicial: '', cuadInicial: '',
    placa1: '', placaLetra: '', placaBis: '', placaCuad: '', placa2: '',
    finalTipo: 'AP', finalValor: '', complemento: ''
  };

  esCampoDireccion(label: string): boolean {
    const lbl = String(label).toLowerCase();
    return lbl.includes('dirección') || lbl.includes('direccion');
  }

  abrirModalDireccion(key: string) {
    this.campoDireccionActivo = key;
    this.direccionesTokens = [];
    this.modalDireccionAbierto = true;
    this.cdr.detectChanges();
  }

  cerrarModalDireccion() {
    this.modalDireccionAbierto = false;
    this.campoDireccionActivo = '';
    this.cdr.detectChanges();
  }

  obtenerDireccionActual(): string {
    return this.direccionesTokens.map(t => t.text).join(" ").replace(/\s+/g, " ").trim();
  }

  confirmarDireccion() {
    const direccionFinal = this.obtenerDireccionActual();

    const control = this.form.get('formDinamico')?.get(this.campoDireccionActivo);
    if (control) {
      control.setValue(direccionFinal);
      control.markAsDirty();
      control.markAsTouched();
      control.updateValueAndValidity();
    }

    this.cerrarModalDireccion();
  }

  limpiarTokens() {
    this.direccionesTokens = [];
    this.cdr.detectChanges(); // 🟢 FORZAR RENDERIZADO
  }

  eliminarToken(index: number) {
    this.direccionesTokens.splice(index, 1);
    this.cdr.detectChanges(); // 🟢 FORZAR RENDERIZADO
  }

  private sanitizeDIAN(raw: string, mode: 'strict' | 'token' | 'numeric' = 'strict'): string {
    const up = (raw || "").toUpperCase().trim();
    const noAcc = up.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (mode === "numeric") return noAcc.replace(/[^0-9]+/g, "").trim();
    const disallowed = mode === "token" ? /[^A-Z0-9Ñ #\-]+/g : /[^A-Z0-9Ñ ]+/g;
    return noAcc.replace(disallowed, " ").replace(/\s+/g, " ").trim();
  }

  // --- Botones de Agregar ---
  addDianInicial() {
    const num = this.sanitizeDIAN(this.dianData.numInicial, "numeric");
    const nombre = this.sanitizeDIAN(this.dianData.nombreViaInicial, "strict");

    if ((num && nombre) || (!num && !nombre)) {
      Swal.fire({
          icon: 'warning',
          title: 'Faltan datos',
          text: 'Debes diligenciar SOLO uno: "Número" o "Nombre de la vía" (no ambos).',
          confirmButtonColor: 'var(--accent)',
          background: 'var(--surface)',
          color: 'var(--text)'
      });
      return;
    }

    const core = num ? num : nombre;
    const parts = num
      ? [this.dianData.viaInicial, core, this.dianData.letraInicial, this.dianData.bisInicial, this.dianData.cuadInicial]
      : [this.dianData.viaInicial, core, this.dianData.bisInicial, this.dianData.cuadInicial];

    const cleanParts = parts.map(p => this.sanitizeDIAN(p, "strict")).filter(Boolean);

    if (cleanParts.length) {
      // 🟢 FIX MAGICO: Creamos un nuevo arreglo en lugar de usar .push()
      this.direccionesTokens = [...this.direccionesTokens, { kind: "INI", text: cleanParts.join(" ") }];
    }

    this.dianData.numInicial = ''; this.dianData.nombreViaInicial = ''; this.dianData.letraInicial = '';
    this.dianData.bisInicial = ''; this.dianData.cuadInicial = '';

    this.cdr.detectChanges();
  }

  addDianPlaca() {
    if (!this.dianData.placa1 || !this.dianData.placa2) {
      Swal.fire({
          icon: 'warning',
          title: 'Faltan datos',
          text: 'Ingresa Parte 1 y Parte 2 de la placa.',
          confirmButtonColor: 'var(--accent)',
          background: 'var(--surface)',
          color: 'var(--text)'
      });
      return;
    }
    const parts = [this.dianData.placa1, this.dianData.placaLetra, this.dianData.placaBis, this.dianData.placaCuad, this.dianData.placa2];
    const cleanParts = parts.map(p => this.sanitizeDIAN(p, "strict")).filter(Boolean);

    if (cleanParts.length) {
      // 🟢 FIX MAGICO
      this.direccionesTokens = [...this.direccionesTokens, { kind: "PLACA", text: cleanParts.join(" ") }];
    }

    this.dianData.placa1 = ''; this.dianData.placa2 = ''; this.dianData.placaLetra = '';
    this.dianData.placaBis = ''; this.dianData.placaCuad = '';

    this.cdr.detectChanges();
  }

  addDianFinal() {
    if (!this.dianData.finalValor) return;
    const cleanParts = [this.dianData.finalTipo, this.dianData.finalValor].map(p => this.sanitizeDIAN(p, "strict")).filter(Boolean);

    if (cleanParts.length) {
      // 🟢 FIX MAGICO
      this.direccionesTokens = [...this.direccionesTokens, { kind: "FIN", text: cleanParts.join(" ") }];
    }
    this.dianData.finalValor = '';

    this.cdr.detectChanges();
  }

  addDianToken(token: string) {
    // 🟢 FIX MAGICO
    this.direccionesTokens = [...this.direccionesTokens, { kind: "TOK", text: token }];
    this.cdr.detectChanges();
  }

  addDianComplemento() {
    const c = this.sanitizeDIAN(this.dianData.complemento, "strict");
    if (c) {
      // 🟢 FIX MAGICO
      this.direccionesTokens = [...this.direccionesTokens, { kind: "COMP", text: c }];
    }
    this.dianData.complemento = '';

    this.cdr.detectChanges();
  }

}
