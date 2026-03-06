import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, Validators, ValidatorFn, FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule, HttpHeaders } from '@angular/common/http';
import { ProgressOverlayComponent } from '../components/progress-overlay/progressOverlay.component';
import { ActivatedRoute, Router } from '@angular/router';
import { services } from '../services';
import Swal from 'sweetalert2';
import { PdfMapService } from './pdfMap.service';
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
  private pdfMapService = inject(PdfMapService);

  // --- Estado ---
  ocParam: string = '';
  osParam: string = '';
  snParam: string = '';
  numSoParam: string = '';
  currentStep = 1;
  esJuridica: boolean = false;
  countrySelected: string | undefined = '';
  isManualMode = false;
  providerType: 'juridica' | 'natural' = 'juridica';
  toastMessage = signal<string | null>(null);
  arrayItems = signal<DocConfig[]>([]);
  form: FormGroup;
  contactosActivos: number = 1; // El contacto 1 siempre es visible
  modalDireccionAbierto = false;
  campoDireccionActivo = '';
  direccionesTokens: { kind: string, text: string }[] = [];

  // --- Datos Dinámicos ---
  camposDinamicos: any[] = [];
  mostrarCamposBeneficiario: boolean = false;
  beneficiariosActivos: number = 0;
  esEmpresaJuridica: boolean = false;
  formularioEstructuraDestino: any = null;
  loadingFormConfig = true;
  archivoSeleccionado: File | null = null;
  documentosActivos: number = 1;
  esUsuarioInterno: boolean = true;
  seccionesDisponibles: string[] = [];
  seccionActualIndex: number = 0;
  // --- Overlay UI ---
  overlayOpen = false;
  overlayTitle = '';
  overlaySubtitle: string | null = null;
  fileInput: HTMLInputElement | undefined;

  constructor( private cdr: ChangeDetectorRef) {
    this.form = this.fb.group({
      step2_docs: this.fb.group({}),
      step3_data: this.fb.group({
        businessName: ['', Validators.required],
        nit: ['', Validators.required],
        legalRepName: ['', Validators.required],
        riskOption: ['NA', Validators.required],
        riskWhich: ['']
      }),
      formDinamico: this.fb.group({})
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

    const apiToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjExM2UyNDNjLTczZjctNGM4NC05MDE1LWU3NWRkZGFiZDI3MSIsImRhdGEiOiIyN2VmOWRiOTg0OTNhYzBiYjFkMmQ1YjJhYjVhZWFjMWViZjY1NDFhYjE4NGVmNTdmYzU3MGFkZmJhM2M1ODY3ODNmMjBhZjg0ZmQ5Y2ZmYWU3NzljYTY5NmRjMDRlZDFjODRiMzRiZjQyNWU4MTJjMDI3MmZmYjdlNTA1Yjg1YjgxNDFmMzc5NGIzNmEyNTEwYjBmODE4Njg0MzhmZGQ0YWUxYmJiMzJiZjIzMDg3OWRmZWQwMDIwYTJjYzdjOTQ0YjhhNGYxYzM0NDA1ZTRhNWRiY2I0NzA4NTc1NzFhZTYxMWZlMWQyYjYzM2YzNWNkMmExZjMyODI5OTljN2FjZjI4MjNiZjJmOTA1N2JiNDZjZjFlMzExNzg2MDQ0ZWZlOGNkYjA5YmM2YzliMjdlNmEyZDYyYjBhNzFjZjcyNGRhY2I2NGJmNzI4MTZkNmQ0ZTJjYTA1NzRmZjJiYjljODc3ZWJkMjhkNzZhZDMzMDA1NzlmMGZmYTlhMTliYWU2M2UwZWJiN2VmZGFhYTlhNjI4NDEzMGJlMzU5MmY3M2Q3ODIwYzQ0MTg2ZGEzMmNlMzBiNzJhYTc2MDIyYWMzZWVlYjI5MDRlNWNlZWU1YTI5OGQxYTIwNzAwZTM3NWFiMWRkMWEzMzcyMjU3NjFjOGIzMTRlOTE0MzM4MzgzMWVkNDJkZmFkNWQwOGMwOTRkZDg1ZDY4YTU4NTAwYmYzZTY5YWEzMmYyN2IyNjU0ZTBiOWI3MzUyMmU5Njc3MzRlZWNiZTUxMTIwMWJmOTFjY2RkOTJlMGQxMjE5YjFjNTFhZGRhODk0Y2U0ZjQ3ODhjODg5YjkwZTllYmY2YmM1OTlhZDkwZDdhNWY2YWQ4YjJkM2ViYzRmN2ZhMWMzZmEwNDJhMWRlOTAwNjhjN2U2YjEyNjhjZTlkNjdmZGUyYWQwMWNmMjg1N2Q2OWNiNDQ2NTIxNThjYzlkZmQ3YWI5MDNkM2Q5YTZmYmQ5N2Q4MDVhYzc4MDI5NTlhY2ZjZDZjMmQwMThlZTdmYzJjMDRkOGNmNzFjNDRlZTlhNGZhNjY1MDM4YjQyZjcwZTQ4NTAwZGNkMTliYTA5MzM0MzZlOWFkYWYxYzlmOWJlYzM0ZjQ2NDY1NmI0YzJhZjg4YTYyNWI5ZTZmNzcyZTNhYTFkMTZhNDU3YzdjZWFhOWU0ZTQ5N2ZhY2Y0YmRkNmVmZWI2NDMzYTNkZDNmY2FiNDBkZmM4NTViOThkMTI2ZmY5ZmIyMWJiZDBmMTcwNzgyYjEyZjQ0ODk5OGQwZGQ1NDk1YjMzODU3ODViMjU1MmU1YmZhMTUyMDhmNGNiNzhjMTc4ZmNhNDkxYjhhZTc5ZDliOTI5ZmE2NWJlZWZlZmQzMTg4NmUzZGVjOGViNzUzMzkiLCJ0eXBlIjoidXNlciIsImlhdCI6MTc3MjcyMzE3NywiZXhwIjoxNzczMzI3OTc3fQ.ycNXyvh9CU262mCfD8enzr4YiUK8i8VKoGDI8mqw__k';
    const headers = new HttpHeaders({ 'Authorization': `Bearer ${apiToken}` });

    this.http.get(apiUrl, { headers }).subscribe({
      next: (respuestaApi: any) => {
        console.log("✅ Estructura descargada exitosamente con Token:", respuestaApi);
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
      queryParams: { step: 1, sn: country },
      queryParamsHandling: 'merge',
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
        queryParamsHandling: 'merge',
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

      let nombreParaMostrar = file.name;

      const partesNombre = file.name.split('.');
      const extension = partesNombre.length > 1 ? partesNombre.pop() : '';

      const matchNum = docKey.match(/\d+/);
      const numDoc = matchNum ? matchNum[0] : '1';

      let campoSistemaGestion: any = null;

      if (numDoc === '1') {
        campoSistemaGestion = this.camposDinamicos.find(c =>
          (c.label.toLowerCase().includes('tipo de sistema de gestión') ||
           c.label.toLowerCase().includes('tipo de sistema')) &&
          !c.key.includes('_clon') &&
          c.type !== 'documento-agrupado'
        );
      } else {
        const cajaAgrupada = this.camposDinamicos.find(c =>
          c.type === 'documento-agrupado' &&
          c.key === `agrupado_${numDoc}`
        );

        if (cajaAgrupada && cajaAgrupada.selectConfig) {
          campoSistemaGestion = cajaAgrupada.selectConfig;
        }
      }

      if (campoSistemaGestion) {
        const valorSelect = this.form.get('formDinamico')?.get(campoSistemaGestion.key)?.value;
        if (valorSelect && String(valorSelect).trim() !== '') {
          nombreParaMostrar = `${valorSelect}.${extension}`;
        }
      }

      this.form.get(`step2_docs.${docKey}`)?.setValue(file);
      this.form.get('step2_docs')?.updateValueAndValidity();

      this.form.get('formDinamico')?.get(docKey)?.setValue(nombreParaMostrar);
      this.cdr.detectChanges();

      if (control) {
        control.setValue(nombreParaMostrar);
        control.markAsDirty();
        control.markAsTouched();
        control.updateValueAndValidity();
        console.log(`✅ Archivo renombrado inyectado en ${docKey}:`, control.value);
      }

      this.cdr.detectChanges();
    }
  }

  eliminarDocumentoAdjunto(controlName: string, fileInput: HTMLInputElement) {
    this.form.get('formDinamico')?.get(controlName)?.setValue('');
    fileInput.value = '';
  }

  removeFile(docKey: string = '', fileInput?: HTMLInputElement) {
    if (this.currentStep === 1) {
      this.form.get(`step2_docs.${docKey}`)?.setValue(null);
      this.form.get('step2_docs')?.updateValueAndValidity();
    }

    if (this.currentStep === 2) {
      this.form.get('formDinamico')?.get(docKey)?.setValue('');
    }

    if (fileInput) {
      fileInput.value = '';
    } else {
      const el = document.getElementById('file-' + docKey) as HTMLInputElement;
      if (el) el.value = '';
    }

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
      this.overlayOpen = true;
      this.overlayTitle = 'Extrayendo Documento...';
      this.overlaySubtitle = 'Analizando datos con IA';
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
    if (intentos > 20) {
      this.overlayOpen = false;
      this.cdr.detectChanges();
      Swal.fire({
        icon: 'warning',
        title: 'Tiempo agotado',
        text: 'El procesamiento está tardando demasiado. Por favor, borra el archivo e intenta subirlo de nuevo.',
        confirmButtonColor: 'var(--accent)'
      });
      return;
    }

    this.services.checkStatus(jobId).subscribe({
      next: (res: any) => {
        const estado = res.status ? res.status.toLowerCase() : '';
        const progreso = res.progress || 0;

        this.overlayTitle = `Analizando documento (${progreso}%)...`;
        this.cdr.detectChanges();

        if (estado === 'completed' || progreso === 100) {
          this.extraerDatosDelJSON(res);
        } else if (estado === 'failed' || estado === 'error') {
          this.overlayTitle = 'Error leyendo el documento en AWS';
          this.cdr.detectChanges();

          setTimeout(() => {
            this.overlayOpen = false;
            this.cdr.detectChanges();
            Swal.fire('Error', 'AWS no pudo procesar este archivo. Intenta con uno más claro.', 'error');
          }, 1500);

        } else {
          setTimeout(() => {
            this.iniciarPolling(jobId, intentos + 1);
          }, 5000);
        }
      },
      error: (err: any) => {
        console.error("Error de red en el polling:", err);
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

      // Hacemos visibles los campos que pertenecen a este número de beneficiario
      this.camposDinamicos.forEach(campo => {
        if (campo.grupoBeneficiario === this.beneficiariosActivos) {
          campo.visible = true;
          campo.seccion = '1. Información del Proveedor'; // Aseguramos que se queden en la sección 3
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


eliminarEsteBeneficiario(grupo: number) {
    Swal.fire({
      title: '¿Quitar beneficiario?',
      text: 'Se borrarán los datos que hayas ingresado para este beneficiario.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: 'var(--error)',
      cancelButtonColor: 'var(--surface-3)',
      confirmButtonText: 'Sí, quitar',
      cancelButtonText: 'Cancelar',
      background: 'var(--surface)',
      color: 'var(--text)',
      customClass: {
        popup: 'provider-card',
        cancelButton: 'btn-secondary'
      }
    }).then((result) => {
      if (result.isConfirmed) {

        // 🟢 Buscamos EXACTAMENTE los campos de este grupo y los destruimos
        this.camposDinamicos.forEach(campo => {
          if (campo.grupoBeneficiario === grupo) {
            campo.visible = false; // Lo ocultamos

            const control = this.form.get('formDinamico')?.get(campo.key);
            if (control) {
              control.setValue(''); // Vaciamos el dato
              control.markAsUntouched(); // Quitamos alertas rojas
              control.setErrors(null); // Evitamos que bloquee el formulario
            }
          }
        });

        // Solo restamos el contador si es mayor a 0
        if (this.beneficiariosActivos > 0) {
          this.beneficiariosActivos--;
        }

        this.cdr.detectChanges();
      }
    });
  }

  getGrupoContacto(key: string): number {
    if (!key) return 0;

    // Si es el select principal, pertenece al Contacto 1
    if (key === 'contactType') return 1;

    // Extrae el número final de las llaves (ej: email2 -> 2)
    const match = key.match(/(contactPerson|positionCompany|email|TelExt|cellphone)(\d+)/);
    return match && match[2] ? parseInt(match[2], 10) : 0;
  }

  esInicioDeContacto(index: number): boolean {
    const campo = this.camposDinamicos[index];
    const grupoActual = this.getGrupoContacto(campo.key);

    if (grupoActual === 0 || campo.visible === false) return false;

    // Revisa hacia atrás para ver si es el primer campo de ese grupo
    for (let i = index - 1; i >= 0; i--) {
      const campoAnterior = this.camposDinamicos[i];
      if (campoAnterior.visible !== false) {
        return this.getGrupoContacto(campoAnterior.key) !== grupoActual;
      }
    }
    return true;
  }

agregarContacto() {
    if (this.contactosActivos < 5) {
      this.contactosActivos++;

      this.camposDinamicos.forEach(campo => {
        // Buscamos los campos que pertenezcan al nuevo número (ej. el 2)
        if (this.getGrupoContacto(campo.key) === this.contactosActivos) {
          campo.visible = true; // Solo los encendemos, ya están en la sección correcta por el paso 1
        }
      });

      this.cdr.detectChanges(); // Forzamos a Angular a redibujar la pantalla bonita

    } else {
      Swal.fire({
        icon: 'warning',
        title: 'Límite alcanzado',
        text: 'Solo se permiten hasta 5 personas de contacto.',
        confirmButtonColor: '#3b82f6',
        background: 'var(--surface)',
        color: 'var(--text)'
      });
    }
  }

  eliminarEsteContacto(grupo: number) {
    Swal.fire({
      title: '¿Eliminar contacto?',
      text: 'Se borrarán los datos de esta persona. Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: 'var(--error)',
      cancelButtonColor: 'var(--surface-3)',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      background: 'var(--surface)',
      color: 'var(--text)'
    }).then((result) => {
      if (result.isConfirmed) {

        // Apagamos los campos y borramos lo que el usuario escribió
        this.camposDinamicos.forEach(campo => {
          if (this.getGrupoContacto(campo.key) === grupo) {
            campo.visible = false;

            const control = this.form.get('formDinamico')?.get(campo.key);
            if (control) {
              control.setValue('');
              control.markAsUntouched();
              control.setErrors(null);
            }
          }
        });

        if (this.contactosActivos > 1) {
          this.contactosActivos--;
        }

        this.cdr.detectChanges();
      }
    });
  }


  eliminarUltimoBeneficiario() {
    if (this.beneficiariosActivos > 0) {
      Swal.fire({
        title: '¿Quitar beneficiario?',
        text: 'Se borrarán los datos que hayas ingresado para este beneficiario.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: 'var(--error)',
        cancelButtonColor: 'var(--surface-3)',
        confirmButtonText: 'Sí, quitar',
        cancelButtonText: 'Cancelar',
        background: 'var(--surface)',
        color: 'var(--text)',
        customClass: {
          popup: 'provider-card',
          cancelButton: 'btn-secondary'
        }
      }).then((result) => {
        if (result.isConfirmed) {

          this.camposDinamicos.forEach(campo => {
            if (campo.grupoBeneficiario === this.beneficiariosActivos) {
              campo.visible = false; // Lo ocultamos de la pantalla

              const control = this.form.get('formDinamico')?.get(campo.key);
              if (control) {
                control.setValue(''); // Vaciamos el dato
                control.markAsUntouched(); // 🟢 Quitamos las alertas rojas de validación
                control.setErrors(null); // 🟢 Evitamos que bloquee el botón de "Siguiente"
              }
            }
          });

          this.beneficiariosActivos--;
          this.cdr.detectChanges();
        }
      });
    }
  }

  esInicioDeBeneficiario(index: number): boolean {
    const campo = this.camposDinamicos[index];
    if (campo.grupoBeneficiario === 0 || campo.visible === false) return false;
    for (let i = index - 1; i >= 0; i--) {
      const campoAnterior = this.camposDinamicos[i];
      if (campoAnterior.visible !== false) {
        return campoAnterior.grupoBeneficiario !== campo.grupoBeneficiario;
      }
    }
    return true;
  }

  mostrarBotonBeneficiario(index: number): boolean {
    if (!this.esEmpresaJuridica || this.beneficiariosActivos >= 10) return false;
    const campoActual = this.camposDinamicos[index];
    if (campoActual.visible === false) return false;

    if (this.beneficiariosActivos === 0) {
      const primerOculto = this.camposDinamicos.findIndex(c => c.grupoBeneficiario > 0);
      if (primerOculto > 0) {
        return index === primerOculto - 1;
      }
      return false;
    } else {
      let ultimoIndiceVisible = -1;
      for (let i = this.camposDinamicos.length - 1; i >= 0; i--) {
        const c = this.camposDinamicos[i];
        if (c.grupoBeneficiario > 0 && c.visible !== false) {
          ultimoIndiceVisible = i;
          break;
        }
      }
      return index === ultimoIndiceVisible;
    }
  }

  esInicioDeSeccion(index: number): boolean {
    const campoActual = this.camposDinamicos[index];
    if (campoActual.visible === false) return false;
    for (let i = index - 1; i >= 0; i--) {
      const campoAnterior = this.camposDinamicos[i];
      if (campoAnterior.visible !== false) {
        return campoAnterior.seccion !== campoActual.seccion;
      }
    }
    return true;
  }



  agregarDocumento() {
    if (this.documentosActivos < 10) {
      this.documentosActivos++;

      const docIndex = this.camposDinamicos.findIndex(c => c.key === `document${this.documentosActivos}`);
      if (docIndex === -1) return;

      const docOriginal = { ...this.camposDinamicos[docIndex] };
      this.camposDinamicos.splice(docIndex, 1);

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

        const llaveAnterior = this.documentosActivos === 2 ? 'document1' : `agrupado_${this.documentosActivos - 1}`;
        const indexAnterior = this.camposDinamicos.findIndex(c => c.key === llaveAnterior);

        const seccionHeredada = indexAnterior !== -1 ? this.camposDinamicos[indexAnterior].seccion : '1. Información del Proveedor';

        docOriginal.visible = true;
        docOriginal.label = `Documento ${this.documentosActivos}`;
        docOriginal.grupoDocumento = this.documentosActivos;

        const campoAgrupado = {
          type: 'documento-agrupado',
          key: `agrupado_${this.documentosActivos}`,
          visible: true,
          isLong: true,
          seccion: seccionHeredada,
          tituloInterno: `📁 Documento Adicional ${this.documentosActivos - 1}`,
          selectConfig: clonSelect,
          fileConfig: docOriginal
        };

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

      this.overlayTitle = 'Organizando la información...';
      this.overlaySubtitle = 'Casi listo';
      this.cdr.detectChanges();

      const tipoContribuyenteObj = fieldsExtraidos.find((f: any) => f.field.includes('Tipo de contribuyente'));
      const esJuridica = tipoContribuyenteObj && tipoContribuyenteObj.value?.toLowerCase().includes('jurídica');

      this.esJuridica = !!esJuridica; // 🟢 Variable global actualizada
      this.esEmpresaJuridica = !!esJuridica;

      this.camposDinamicos = [];
      const controlesReactivos: { [key: string]: any } = {};

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

            // 🟢 CORRECCIÓN LÓGICA: Ahora sí muestra los datos de la IA correctamente
            let esCampoParaEsteUsuario = true;
            const camposSoloNatural = ['firstLastName', 'secondLastName', 'identification', 'identificationNumber', 'names'];
            const camposSoloJuridica = ['companyname','nitId', 'dv', 'representativeName', 'nationalIdentityCard', 'riskControlSystem', 'which risk',];

            if (this.esEmpresaJuridica) {
              if (camposSoloNatural.includes(key)) esCampoParaEsteUsuario = false;
            } else {
              if (camposSoloJuridica.includes(key) || key.toLowerCase().includes('beneficiary')) esCampoParaEsteUsuario = false;
            }

            const nroContacto = this.getGrupoContacto(key);
            let esVisible = true;
            let grupoBeneficiario = 0;
            let grupoDocumento = 0;
            if (nroContacto > 1) {
               esVisible = false;
            }

            if (this.esEmpresaJuridica && key.toLowerCase().includes('beneficiary')) {
              const match = key.match(/\d+/);
              if (match) {
                grupoBeneficiario = parseInt(match[0], 10);
                esVisible = false; // Los beneficiarios inician ocultos hasta darle click a "+"
              }
            }
            if (nroContacto > 1) {
              esVisible = false;
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

              let nombreSeccion = itemPlantilla.fields.section || itemPlantilla.section || '1. Información del Proveedor';

              if (grupoBeneficiario > 0 || key.toLowerCase().includes('beneficiary')) {
                nombreSeccion = '1. Información del Proveedor';
              }

              const nroContacto = this.getGrupoContacto(key);
              if (nroContacto > 0 || key.toLowerCase().includes('contact')) {
                nombreSeccion = '3. INFORMACIÓN GENERAL DEL PROVEEDOR';
              }

             this.camposDinamicos.push({
                key: key,
                label: itemPlantilla.fields.labelName,
                visible: esVisible,         // 👈 Nace visible solo si es el contacto 1
                seccion: nombreSeccion,     // 👈 Forzado a la sección 3
                type: itemPlantilla.fields.labelType || 'text',
                options: itemPlantilla.fields.options || [],
                isLong: false,
                columnSpan: itemPlantilla.fields.columnSpan || 1,
                autocompletado: false,
                grupoBeneficiario: 0,
                grupoDocumento: 0,
                orderToGetValue: itemPlantilla.fields.orderToGetValue || 99
              });
                  }
          }
        });
      }

      const camposManualesAdicionales: any[] = [
        // --- SECCIÓN 3: INFORMACIÓN GENERAL ---
        { key: 'contactPerson', label: 'Persona de contacto', type: 'text', seccion: '3. INFORMACIÓN GENERAL DEL PROVEEDOR', visible: true, columnSpan: 1 },
        { key: 'positionCompany', label: 'Cargo', type: 'text', seccion: '3. INFORMACIÓN GENERAL DEL PROVEEDOR', visible: true, columnSpan: 1},
        { key: 'email', label: 'Email', type: 'email', seccion: '3. INFORMACIÓN GENERAL DEL PROVEEDOR', visible: true, columnSpan: 1 },
        { key: 'TelExt', label: 'Tel/ext', type: 'text', seccion: '3. INFORMACIÓN GENERAL DEL PROVEEDOR', visible: true, columnSpan: 1 },
        { key: 'cellphone', label: 'Celular', type: 'text', seccion: '3. INFORMACIÓN GENERAL DEL PROVEEDOR', visible: true, columnSpan: 1 },
        { key: 'department', label: 'Departamento', type: 'text', seccion: '3. INFORMACIÓN GENERAL DEL PROVEEDOR', visible: true, columnSpan: 1 },
        { key: 'City', label: 'Ciudad', type: 'text', seccion: '3. INFORMACIÓN GENERAL DEL PROVEEDOR', visible: true, columnSpan: 1 },
        { key: 'address', label: 'Dirección', type: 'text', seccion: '3. INFORMACIÓN GENERAL DEL PROVEEDOR', visible: true, columnSpan: 1 },
        { key: 'addressHeadquarters', label: 'Dirección (2) sede', type: 'text', seccion: '3. INFORMACIÓN GENERAL DEL PROVEEDOR', visible: true, columnSpan: 1 },

        // 🟢 CAJA INFORMATIVA BENEFICIARIOS (Solo Jurídicas) -> ordenFijo: 15.5 para que quede al final de la Sec 3
        { key: 'texto_info_beneficiario', label: '', type: 'beneficiary-info', seccion: '3. INFORMACIÓN GENERAL DEL PROVEEDOR', visible: true, columnSpan: 3, ordenFijo: 15.5 },

        // --- SECCIÓN 4: INFORMACIÓN TRIBUTARIA ---
        { key: 'companyType', label: 'Tipo empresa', type: 'select', seccion: '4. INFORMACIÓN TRIBUTARIA', visible: true, columnSpan: 1 },
        { key: 'ivaRegime', label: 'Régimen de IVA', type: 'select', seccion: '4. INFORMACIÓN TRIBUTARIA', visible: true, columnSpan: 1 },
        { key: 'largeTaxpayer', label: 'Gran Contribuyente', type: 'select', seccion: '4. INFORMACIÓN TRIBUTARIA', visible: true, columnSpan: 1 },
        { key: 'numberResolutionDate', label: 'No. y fecha Resolución (Gran Contrib.)', type: 'text', seccion: '4. INFORMACIÓN TRIBUTARIA', visible: true, columnSpan: 1 },
        { key: 'selfRetaining', label: 'Autorretenedor', type: 'select', seccion: '4. INFORMACIÓN TRIBUTARIA', visible: true, columnSpan: 1 },
        { key: 'selfRetainingNumberResolutionDate', label: 'No. y fecha Resolución (Autorret.)', type: 'text', seccion: '4. INFORMACIÓN TRIBUTARIA', visible: true, columnSpan: 1 },
        { key: 'icaActivityCode', label: 'Código actividad ICA', type: 'text', seccion: '4. INFORMACIÓN TRIBUTARIA', visible: true, columnSpan: 1 },
        { key: 'icaFee', label: 'Tarifa ICA', type: 'text', seccion: '4. INFORMACIÓN TRIBUTARIA', visible: true, columnSpan: 1 },
        { key: 'economicActivity', label: 'Actividad económica (código CIUU)', type: 'text', seccion: '4. INFORMACIÓN TRIBUTARIA', visible: true, columnSpan: 1 },

        // --- SECCIÓN 5: INFORMACIÓN BANCARIA ---
        { key: 'nameBank', label: 'Nombre del banco', type: 'text', seccion: '5. INFORMACIÓN BANCARIA', visible: true, columnSpan: 1 },
        { key: 'branch', label: 'Sucursal', type: 'text', seccion: '5. INFORMACIÓN BANCARIA', visible: true, columnSpan: 1},
        { key: 'countryCity', label: 'País/ciudad', type: 'text', seccion: '5. INFORMACIÓN BANCARIA', visible: true, columnSpan: 1 },
        { key: 'bankAddress', label: 'Dirección', type: 'text', seccion: '5. INFORMACIÓN BANCARIA', visible: true, columnSpan: 1},
        { key: 'bankPhone', label: 'Teléfono', type: 'text', seccion: '5. INFORMACIÓN BANCARIA', visible: true, columnSpan: 1 },
        { key: 'accountNumber', label: 'Número de cuenta', type: 'text', seccion: '5. INFORMACIÓN BANCARIA', visible: true, columnSpan: 1 },
        { key: 'typeAccount', label: 'Tipo de cuenta', type: 'select', seccion: '5. INFORMACIÓN BANCARIA', visible: true, columnSpan: 1 },
        { key: 'paymentCurrency', label: 'Moneda de pago', type: 'select', seccion: '5. INFORMACIÓN BANCARIA', visible: true, columnSpan: 1 },
        { key: 'agreedPaymentTerm', label: 'Plazo de Pago pactado', type: 'text', seccion: '5. INFORMACIÓN BANCARIA', visible: true, columnSpan: 1},
        { key: 'paymentMethod', label: 'Método de pago', type: 'select', seccion: '5. INFORMACIÓN BANCARIA', visible: true, columnSpan: 1 },
        { key: 'emailElectronicBillingPayments', label: 'E-mail Facturación electrónica/Pagos', type: 'email', seccion: '5. INFORMACIÓN BANCARIA', visible: true, columnSpan: 1 },
        { key: 'WhichMetodWire', label: '¿Cuales?', type: 'text', seccion: '5. INFORMACIÓN BANCARIA', visible: true, columnSpan: 1 },

        // --- SECCIÓN 6: DOCUMENTACIÓN REQUERIDA ---
        { key: 'texto_info_seccion6', label: '', type: 'docs-info', seccion: '6. DOCUMENTACIÓN REQUERIDA', visible: true, columnSpan: 3, ordenFijo: 45.5 }, // 🟢 Decimal para ubicarse bien
        { key: 'typeManagementSystem', label: 'Tipo de sistema de gestión', type: 'select', seccion: '6. DOCUMENTACIÓN REQUERIDA', visible: true, columnSpan: 1},
        { key: 'document1', label: 'Documento sistema de gestión', type: 'text', seccion: '6. DOCUMENTACIÓN REQUERIDA', visible: true, columnSpan: 2, required: false, grupoDocumento: 1 },
        { key: 'document_ambiental', label: 'Certificación ISO 14001 o Sostenibilidad', type: 'text', seccion: '6. DOCUMENTACIÓN REQUERIDA', visible: true, columnSpan: 3 },

        // 🟢 SECCIÓN 8: USO EXCLUSIVO NUVANT
        { key: 'applicationState', label: 'Estado de la solicitud', type: 'select', seccion: '8. ESPACIO EXCLUSIVO PARA NUVANT', visible: this.esUsuarioInterno, columnSpan: 1, required: this.esUsuarioInterno, ordenFijo: 90.1 },
        { key: 'requestedBy', label: 'Solicitado por', type: 'text', seccion: '8. ESPACIO EXCLUSIVO PARA NUVANT', visible: this.esUsuarioInterno, columnSpan: 1, required: this.esUsuarioInterno, ordenFijo: 90.2 },
        { key: 'managementWhichItBelongs', label: 'Gerencia a la que pertenece', type: 'select', seccion: '8. ESPACIO EXCLUSIVO PARA NUVANT', visible: this.esUsuarioInterno, columnSpan: 1, required: this.esUsuarioInterno, ordenFijo: 90.3 },
        { key: 'ApplicantPosition', label: 'Cargo del solicitante', type: 'select', seccion: '8. ESPACIO EXCLUSIVO PARA NUVANT', visible: this.esUsuarioInterno, columnSpan: 1, required: this.esUsuarioInterno, ordenFijo: 90.4 },
        { key: 'supplierType', label: 'Tipo de proveedor', type: 'select', seccion: '8. ESPACIO EXCLUSIVO PARA NUVANT', visible: this.esUsuarioInterno, columnSpan: 2, required: this.esUsuarioInterno, ordenFijo: 90.5 },
        { key: 'supplierClassification', label: 'Clasificación del proveedor', type: 'select', seccion: '8. ESPACIO EXCLUSIVO PARA NUVANT', visible: this.esUsuarioInterno, columnSpan: 2, required: this.esUsuarioInterno, ordenFijo: 90.6 },
        { key: 'date', label: 'Fecha', type: 'date', seccion: '8. ESPACIO EXCLUSIVO PARA NUVANT', visible: this.esUsuarioInterno, columnSpan: 1, required: this.esUsuarioInterno, ordenFijo: 90.7 },
        { key: 'isCounterpartySelected', label: '¿El proveedor es seleccionado por la contraparte?', type: 'textarea', seccion: '8. ESPACIO EXCLUSIVO PARA NUVANT', visible: this.esUsuarioInterno, columnSpan: 3, ordenFijo: 90.8 }
      ];




      // =========================================================================
      // 🟢 LA MAGIA DE HERENCIA Y ORDENAMIENTO (BASADO EN API)
      // =========================================================================
      camposManualesAdicionales.forEach(campoManual => {

        const indexAPI = this.camposDinamicos.findIndex(c => c.key === campoManual.key || c.label.toLowerCase().trim() === campoManual.label.toLowerCase().trim());

        let valorDeIA = '';
        let extraidoPorIA = false;
        let opcionesDelBackend = campoManual.options || [];
        let ordenDefinitivo = campoManual.ordenFijo || 9999; // 🟢 Por defecto toma el orden que le pusimos, si no tiene, va al final

        if (indexAPI !== -1) {
          const campoAPI = this.camposDinamicos[indexAPI];
          const llaveAPI = campoAPI.key;

          valorDeIA = controlesReactivos[llaveAPI] ? controlesReactivos[llaveAPI][0] : '';
          extraidoPorIA = campoAPI.autocompletado;

          if (campoAPI.options && campoAPI.options.length > 0) {
            opcionesDelBackend = campoAPI.options;
          }

          // 🟢 Si la API trae un orden para este campo, sobrescribimos el manual
          if (campoAPI.orderToGetValue !== undefined && campoAPI.orderToGetValue !== 9999) {
            ordenDefinitivo = campoAPI.orderToGetValue;
          }

          delete controlesReactivos[llaveAPI];
          this.camposDinamicos.splice(indexAPI, 1);
        }

        controlesReactivos[campoManual.key] = [valorDeIA, campoManual.required ? Validators.required : null];

        this.camposDinamicos.push({
          key: campoManual.key,
          label: campoManual.label,
          type: campoManual.type,
          options: opcionesDelBackend,
          isLong: false,
          columnSpan: campoManual.columnSpan,
          autocompletado: extraidoPorIA,
          visible: campoManual.visible,
          grupoBeneficiario: 0,
          grupoDocumento: campoManual.grupoDocumento || 0,
          seccion: campoManual.seccion,
          orderToGetValue: ordenDefinitivo // 🟢 Guardamos el orden final para la grilla
        });
      });

      // =========================================================================
      // 🟢 ORDEN FINAL ABSOLUTO DE TODOS LOS CAMPOS
      // =========================================================================

      // 1. Ordenamos todos los campos combinados usando el número dictado por la API (o nuestros decimales)
      this.camposDinamicos.sort((a, b) => {
         const ordenA = a.orderToGetValue || 9999;
         const ordenB = b.orderToGetValue || 9999;
         return ordenA - ordenB;
      });

      // 2. Extraemos las secciones respetando el orden matemático que acabamos de establecer
      this.seccionesDisponibles = [...new Set(this.camposDinamicos.map(c => c.seccion))];
      this.seccionActualIndex = 0;

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

  validarVigenciaRut(textoFecha: string): boolean {
    if (!textoFecha) return false;

    const match = textoFecha.match(/(\d{2})-(\d{2})-(\d{4})/);
    if (!match) return false;

    const dia = parseInt(match[1], 10);
    const mes = parseInt(match[2], 10) - 1;
    const anio = parseInt(match[3], 10);

    const fechaRUT = new Date(anio, mes, dia);
    const fechaHoy = new Date();

    const diferenciaMilisegundos = fechaHoy.getTime() - fechaRUT.getTime();
    const diasPasados = Math.floor(diferenciaMilisegundos / (1000 * 60 * 60 * 24));

    console.log(`📅 El RUT fue generado hace ${diasPasados} días.`);

    return diasPasados <= 30;
  }

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
    this.cdr.detectChanges();
  }

  eliminarToken(index: number) {
    this.direccionesTokens.splice(index, 1);
    this.cdr.detectChanges();
  }

  private sanitizeDIAN(raw: string, mode: 'strict' | 'token' | 'numeric' = 'strict'): string {
    const up = (raw || "").toUpperCase().trim();
    const noAcc = up.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (mode === "numeric") return noAcc.replace(/[^0-9]+/g, "").trim();
    const disallowed = mode === "token" ? /[^A-Z0-9Ñ #\-]+/g : /[^A-Z0-9Ñ ]+/g;
    return noAcc.replace(disallowed, " ").replace(/\s+/g, " ").trim();
  }

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
      this.direccionesTokens = [...this.direccionesTokens, { kind: "FIN", text: cleanParts.join(" ") }];
    }
    this.dianData.finalValor = '';

    this.cdr.detectChanges();
  }

  addDianToken(token: string) {
    this.direccionesTokens = [...this.direccionesTokens, { kind: "TOK", text: token }];
    this.cdr.detectChanges();
  }

  addDianComplemento() {
    const c = this.sanitizeDIAN(this.dianData.complemento, "strict");
    if (c) {
      this.direccionesTokens = [...this.direccionesTokens, { kind: "COMP", text: c }];
    }
    this.dianData.complemento = '';

    this.cdr.detectChanges();
  }
  validarSeccionActual(): boolean {
    const camposSeccion = this.camposDinamicos.filter(c => c.seccion === this.seccionesDisponibles[this.seccionActualIndex] && c.visible !== false);
    let esValido = true;

    camposSeccion.forEach(c => {
      const control = this.form.get('formDinamico')?.get(c.key);
      if (control && control.invalid) {
        control.markAsTouched(); // Marca en rojo el campo faltante
        esValido = false;
      }
    });
    return esValido;
  }
  getNombreCorto(seccion: string): string {
    const nombreLimpio = seccion.replace(/^\d+\.\s*/, '').toUpperCase();

    if (nombreLimpio.includes('GENERAL')) return 'Info. General';
    if (nombreLimpio.includes('TRIBUTARIA')) return 'Tributaria';
    if (nombreLimpio.includes('BANCARIA')) return 'Bancaria';
    if (nombreLimpio.includes('DOCUMENTACIÓN') || nombreLimpio.includes('REQUERIDA')) return 'Documentos';
    if (nombreLimpio.includes('CUMPLIMIENTO') || nombreLimpio.includes('LEGAL')) return 'Legal';
    if (nombreLimpio.includes('NUVANT')) return 'Uso Interno';

    return nombreLimpio.length > 15 ? nombreLimpio.substring(0, 15) + '...' : nombreLimpio;
  }

  siguienteSeccion() {
    if (!this.validarSeccionActual()) {
      Swal.fire({
        icon: 'warning',
        title: 'Campos incompletos',
        text: 'Por favor, diligencia todos los campos obligatorios (*) de esta sección para continuar.',
        confirmButtonColor: 'var(--accent)',
        background: 'var(--surface)',
        color: 'var(--text)'
      });
      return;
    }

    if (this.seccionActualIndex < this.seccionesDisponibles.length - 1) {
      this.seccionActualIndex++; // Avanza a la siguiente sección
    } else {
      this.currentStep = 3; // Si ya era la última sección, pasa al Paso 3 (Revisión)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' }); // Sube el scroll suavemente
    this.cdr.detectChanges();
  }

  anteriorSeccion() {
    if (this.seccionActualIndex > 0) {
      this.seccionActualIndex--; // Retrocede una sección
    } else {
      this.currentStep = 1; // Si estaba en la primera, vuelve a los documentos
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.cdr.detectChanges();
  }
}
