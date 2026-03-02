import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, Validators, ValidatorFn } from '@angular/forms';
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
  imports: [CommonModule, ReactiveFormsModule, ProgressOverlayComponent, HttpClientModule, DynamicFieldComponent],
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

  // --- Datos Dinámicos ---
  camposDinamicos: any[] = [];
  mostrarCamposBeneficiario: boolean = false;

  formularioEstructuraDestino: any = null; // Guardará el JSON de tu API
  loadingFormConfig = true;

  // --- Overlay UI ---
  overlayOpen = false;
  overlayTitle = '';
  overlaySubtitle: string | null = null;

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
    const apiToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjExM2UyNDNjLTczZjctNGM4NC05MDE1LWU3NWRkZGFiZDI3MSIsImRhdGEiOiIyN2VmOWRiOTg0OTNhYzBiYjFkMmQ1YjJhYjVhZWFjMWViZjY1NDFhYjE4NGVmNTdmYzU3MGFkZmJhM2M1ODY3ODNmMjBhZjg0ZmQ5Y2ZmYWU3NzljYTY5NmRjMDRlZDFjODRiMzRiZjQyNWU4MTJjMDI3MmZmYjdlNTA1Yjg1YjgxNDFmMzc5NGIzNmEyNTEwYjBmODE4Njg0MzhmZGQ0YWUxYmJiMzJiZjIzMDg3OWRmZWQwMDIwYTJjYzdjOTQ0YjhhNGYxYzM0NDA1ZTRhNWRiY2I0NzA4NTc1NzFhZTYxMWZlMWQyYjYzM2YzNWNkMmExZjMyODI5OTljN2FjZjI4MjNiZjJmOTA1N2JiNDZjZjFlMzExNzg2MDQ0ZWZlOGNkYjA5YmM2YzliMjdlNmEyZDYyYjBhNzFjZjcyNGRhY2I2NGJmNzI4MTZkNmQ0ZTJjYTA1NzRmZjJiYjljODc3ZWJkMjhkNzZhZDMzMDA1NzlmMGZmYTlhMTliYWU2M2UwZWJiN2VmZGFhYTlhNjI4NDEzMGJlMzU5MmY3M2Q3ODIwYzQ0MTg2ZGEzMmNlMzBiNzJhYTc2MDIyYWMzZWVlYjI5MDRlNWNlZWU1YTI5OGQxYTIwNzAwZTM3NWFiMWRkMWEzMzcyMjU3NjFjOGIzMTRlOTE0MzM4MzgzMWVkNDJkZmFkNWQwOGMwOTRkZDg1ZDY4YTU4NTAwYmYzZTY5YWEzMmYyN2IyNjU0ZTBiOWI3MzUyMmU5Njc3MzRlZWNiZTUxMTIwMWJmOTFjY2RkOTJlMGQxMjE5YjFjNTFhZGRhODk0Y2U0ZjQ3ODhjODg5YjkwZTllYmY2YmM1OTlhZDkwZDdhNWY2YWQ4YjJkM2ViYzRmN2ZhMWMzZmEwNDJhMWRlOTAwNjhjN2U2YjEyNjhjZTlkNjdmZGUyYWQwMWNmMjg1N2Q2OWNiNDQ2NTIxNThjYzlkZmQ3YWI5MDNkM2Q5YTZmYmQ5N2Q4MDVhYzc4MDI5NTlhY2ZjZDZjMmQwMThlZTdmYzJjMDRkOGNmNzFjNDRlZTlhNGZhNjY1MDM4YjQyZjcwZTQ4NTAwZGNkMTliYTA5MzM0MzZlOWFkYWYxYzlmOWJlYzM0ZjQ2NDY1NmI0YzJhZjg4YTYyNWI5ZTZmNzcyZTNhYTFkMTZhNDU3YzdjZWFhOWU0ZTQ5N2ZhY2Y0YmRkNmVmZWI2NDMzYTNkZDNmY2FiNDBkZmM4NTViOThkMTI2ZmY5ZmIyMWJiZDBmMTcwNzgyYjEyZjQ0ODk5OGQwZGQ1NDk1YjMzODU3ODViMjU1MmU1YmZhMTUyMDhmNGNiNzhjMTc4ZmNhNDkxYjhhZTc5ZDliOTI5ZmE2NWJlZWZlZmQzMTg4NmUzZGVjOGViNzUzMzkiLCJ0eXBlIjoidXNlciIsImlhdCI6MTc3MTkzOTQxOSwiZXhwIjoxNzcyNTQ0MjE5fQ.Nse9hpTraxfPyP6EH_6FxFRl8d0ImkvnGD9FrHaA938';

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

  onFileSelected(event: Event, docKey: string) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.form.get(`step2_docs.${docKey}`)?.setValue(file);
      this.form.get('step2_docs')?.updateValueAndValidity();
    }
  }

  removeFile(docKey: string) {
    this.form.get(`step2_docs.${docKey}`)?.setValue(null);
    this.form.get('step2_docs')?.updateValueAndValidity();
    this.camposDinamicos = [];
    this.form.setControl('formDinamico', this.fb.group({})); // Resetea el grupo pero no lo borra

    const fileInput = document.getElementById('file-' + docKey) as HTMLInputElement;
    if (fileInput) fileInput.value = '';
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
          this.overlayTitle = 'Error: No se recibió Ticket de AWS';
          setTimeout(() => this.overlayOpen = false, 3000);
        }
      },
      error: (err) => {
        console.error("❌ Error enviando PDF:", err);
        this.overlayTitle = 'Error de conexión con AWS';
        setTimeout(() => this.overlayOpen = false, 3000);
      }
    });
  }

  iniciarPolling(jobId: string) {
    this.services.checkStatus(jobId).subscribe({
      next: (res: any) => {
        const estado = res.status ? res.status.toLowerCase() : '';
        const progreso = res.progress || 0;
        this.overlayTitle = `Analizando documento (${progreso}%)...`;

        if (estado === 'completed' || progreso === 100) {
          this.extraerDatosDelJSON(res);
        } else if (estado === 'failed' || estado === 'error') {
          this.overlayTitle = 'Error leyendo el documento en AWS';
          setTimeout(() => this.overlayOpen = false, 3000);
        } else {
          setTimeout(() => { this.iniciarPolling(jobId); }, 5000);
        }
      },
      error: (err: any) => {
        setTimeout(() => { this.iniciarPolling(jobId); }, 5000);
      }
    });
  }

  // ESTA ES LA FUNCIÓN CLAVE CORREGIDA
  extraerDatosDelJSON(statusRes: any) {
    console.log("🚀 Iniciando extracción y mapeo dinámico...");

    const fields = statusRes.result?.resultsByPage?.[0]?.fields || [];

    // 1. Datos Fijos (Step 3 - Si aún los necesitas separados)
    const nitField = fields.find((f: any) => f.field?.toLowerCase().includes('nit'));
    const nameField = fields.find((f: any) => {
      const n = f.field?.toLowerCase() || '';
      return n.includes('razón social') || n.includes('razon social') || n.includes('nombres');
    });

    this.form.get('step3_data')?.patchValue({
      businessName: nameField?.value || '',
      nit: nitField?.value || ''
    });

    // 2. MOTOR DINÁMICO
    if (this.formularioEstructuraDestino) {

      // A. Mapeo Mágico a través del Servicio
      this.formularioEstructuraDestino = this.pdfMapService.fillFormWithPdfData(
        statusRes,
        this.formularioEstructuraDestino
      );

      this.camposDinamicos = [];
      const controlesReactivos: { [key: string]: any } = {};

      // B. Unificamos la estructura leída
      const dataRead = this.formularioEstructuraDestino.allowedToRead?.data || [];
      const dataWrite = this.formularioEstructuraDestino.isAllowedToWrite?.data || [];
      const secciones = [...dataRead, ...dataWrite];

      // C. Recorremos para armar el UI y el FormBuilder
      secciones.forEach((item: any) => {
        if (item.fields && item.fields.labelId) {
          const key = item.fields.labelId;
          const valorExtraido = item.valueField; // Tomamos el valor que cruzó el Service

          const fueExtraidoPorIA = valorExtraido !== null && valorExtraido !== undefined && String(valorExtraido).trim() !== '';
          // 🛡️ LA MAGIA: Solo agregamos el campo si tiene un valor real (no nulo ni vacío)


            // 1. Lo agregamos al formulario reactivo
        controlesReactivos[key] = [fueExtraidoPorIA ? valorExtraido : ''];
            // 2. Lo enviamos al HTML respetando el TYPE de la API
        this.camposDinamicos.push({
            key: key,
            label: item.fields.labelName,
            type: item.fields.labelType || 'text',
            options: item.fields.options || [],
            // Si la pregunta es muy larga (ej. la de Lavado de Activos), la ponemos a pantalla completa
            isLong: String(item.fields.labelName).length > 50,
            autocompletado: fueExtraidoPorIA // ✨ Le pasamos el flag al HTML
          });
        }
      });

      // D. Inyectar todo al form principal
      this.form.setControl('formDinamico', this.fb.group(controlesReactivos));
      console.log("🎯 Formulario dinámico creado:", this.form.get('formDinamico')?.value);

    } else {
      console.error("⚠️ La plantilla de la API no estaba cargada.");
    }

    // 3. Finalizar y mover a la vista del formulario
    this.overlayTitle = '¡Análisis completado!';
    setTimeout(() => {
      this.overlayOpen = false;
      this.currentStep = 2; // Asegúrate que este sea el paso de tu HTML para "formDinamico"
      this.cdr.detectChanges(); // Forzar detección de cambios para actualizar la UI

    }, 1500);
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
}
