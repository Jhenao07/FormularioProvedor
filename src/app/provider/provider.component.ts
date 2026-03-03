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

  onFileSelected(event: Event, docKey: string, fileInput: HTMLInputElement) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const control = this.form.get('formDinamico')?.get(docKey);
      this.form.get(`step2_docs.${docKey}`)?.setValue(file);
      this.form.get('step2_docs')?.updateValueAndValidity();
      this.form.get('formDinamico')?.get(docKey)?.setValue(file.name);
      this.cdr.detectChanges();

      if (control) {
      // 2. Seteamos el valor (el nombre del archivo)
      control.setValue(file.name);

      // 3. Marcamos como sucio y tocado para que la UI reaccione
      control.markAsDirty();
      control.markAsTouched();

      // 4. Actualizamos validez (esto dispara el renderizado en componentes dinámicos)
      control.updateValueAndValidity();

      console.log(`✅ Valor inyectado en ${docKey}:`, control.value);
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
  async procesarYSiguiente() {
  // Buscamos el documento cargado (usando 'rut' como ejemplo de key)
  const docKey = 'rut';
  const file = this.form.get(`step2_docs.${docKey}`)?.value;

  if (file instanceof File) {
    // Si hay archivo, iniciamos procesamiento con Loader de Swal
    Swal.fire({
      title: 'Extrayendo Documento...',
      text: 'Estamos analizando los datos con IA, un momento.',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
    this.procesarPdf(docKey);
  } else {
    // Si no hay archivo (aunque el botón esté disabled), avanzamos normal
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
  agregarBeneficiario() {
    if (this.beneficiariosActivos < 10) {
      this.beneficiariosActivos++;

      // Recorremos los campos y volvemos visibles los del grupo actual
      this.camposDinamicos.forEach(campo => {
        if (campo.grupoBeneficiario === this.beneficiariosActivos) {
          campo.visible = true;
        }
      });
    } else {
      alert("Has alcanzado el límite máximo de 10 beneficiarios.");
    }
  }
agregarDocumento() {
  if (this.documentosActivos < 10) {
    this.documentosActivos++;

    this.camposDinamicos.forEach(campo => {

      if (campo.grupoDocumento === this.documentosActivos) {
        campo.visible = true;
      }
    });
  } else {
    alert("Límite de 10 documentos alcanzado.");
  }
  this.cdr.detectChanges();
}

async extraerDatosDelJSON(statusRes: any) {
  console.log("🚀 Iniciando extracción inteligente de RUT y Plantilla...");

  const fieldsExtraidos = statusRes.result?.resultsByPage?.[0]?.fields || [];

  // 🟢 1. REGLA DE NEGOCIO: VALIDAR VIGENCIA DEL RUT (Máximo 30 días)
  const campoFecha = fieldsExtraidos.find((f: any) => f.field === 'Fecha generación documento');

  if (campoFecha && campoFecha.value) {
    const esValido = this.validarVigenciaRut(campoFecha.value);

    if (!esValido) {
      // 🔴 CAMBIO: SweetAlert2 en lugar de alert nativo
      await Swal.fire({
        title: 'Documento Vencido',
        text: 'El documento tiene más de 30 días de antigüedad. Por favor, adjunta uno reciente.',
        icon: 'error',
        confirmButtonColor: 'var(--accent)', // Usa tu variable de color naranja
        background: 'var(--surface)',
        color: 'var(--text)',
        customClass: {
          popup: 'provider-card' // Reutiliza tu clase de glassmorphism
        }
      });

      this.removeFile(); // Limpiamos según tu requerimiento de borrar adjuntos
      return;
    }
  }

  // Muestra un loader de Swal para que el usuario no sienta la demora del procesamiento
  Swal.fire({
    title: 'Procesando datos...',
    text: 'Estamos organizando la información en el formulario.',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  // 🟢 2. DETECTAR TIPO DE CONTRIBUYENTE
  const tipoContribuyenteObj = fieldsExtraidos.find((f: any) => f.field.includes('Tipo de contribuyente'));
  const esJuridica = tipoContribuyenteObj && tipoContribuyenteObj.value?.toLowerCase().includes('jurídica');
  this.esEmpresaJuridica = !!esJuridica;

  this.camposDinamicos = [];
  const controlesReactivos: { [key: string]: any } = {};

  // 🟢 3. INYECTAR DATOS DEL PDF (API 1)
  fieldsExtraidos.forEach((itemRut: any) => {
    if (itemRut.value !== null && itemRut.value !== undefined && String(itemRut.value).trim() !== '') {
      const safeKey = itemRut.field.replace(/[^a-zA-Z0-9]/g, '_');
      controlesReactivos[safeKey] = [itemRut.value];
      this.camposDinamicos.push({
        key: safeKey,
        label: itemRut.field,
        type: 'text',
        options: [],
        isLong: false,
        autocompletado: true,
        visible: true,
        grupoBeneficiario: 0,
        grupoDocumento: 0
      });
    }
  });

  // 🟢 4. INYECTAR PLANTILLA (API 2) - Lógica de 4 columnas y filtros
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

        if (this.esEmpresaJuridica && key.startsWith('finalBeneficiary')) {
          const match = key.match(/\d+$/);
          if (match) {
            grupoBeneficiario = parseInt(match[0], 10);
            esVisible = false;
          }
        }

        if (key.startsWith('document')) {
          const match = key.match(/\d+$/);
          if (match) {
            grupoDocumento = parseInt(match[0], 10);
            if (grupoDocumento > this.documentosActivos) esVisible = false;
          }
        }

        if (!controlesReactivos[key] && esCampoParaEsteUsuario) {
          controlesReactivos[key] = [fueExtraidoPorIA ? valorExtraido : ''];
          this.camposDinamicos.push({
            key: key,
            label: itemPlantilla.fields.labelName,
            type: itemPlantilla.fields.labelType || 'text',
            options: itemPlantilla.fields.options || [],
            isLong: String(itemPlantilla.fields.labelName).length > 50,
            autocompletado: fueExtraidoPorIA,
            visible: esVisible,
            grupoBeneficiario: grupoBeneficiario,
            grupoDocumento: grupoDocumento
          });
        }
      }
    });
  }

  // 🟢 5. FINALIZAR Y CERRAR MODALES
  this.form.setControl('formDinamico', this.fb.group(controlesReactivos));

  // Cerramos el loader de Swal antes de cambiar de paso
  Swal.close();

  this.overlayTitle = '¡Análisis completado!';
  setTimeout(() => {
    this.overlayOpen = false;
    Swal.close();
    this.currentStep = 2;
    this.cdr.detectChanges();
  }, 1000); // Reducido a 1s para mejorar la percepción de velocidad
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
}
