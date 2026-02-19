import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, Validators, ValidatorFn } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { ProgressOverlayComponent } from '../components/progress-overlay/progressOverlay.component';
import { ActivatedRoute, Router } from '@angular/router';
import { services } from '../services';
import { trigger, transition, style, animate } from '@angular/animations';

interface DocConfig {
  title: string;
  key: string;
}

interface ExtractedData {
  nombres?: string;
  apellidos?: string;
  numeroDocumento?: string;
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
  imports: [CommonModule, ReactiveFormsModule, ProgressOverlayComponent, HttpClientModule],
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

  // --- Estado ---
  currentStep = 1;
  countrySelected: string | undefined = '';
  isManualMode = false;
  providerType: 'juridica' | 'natural' = 'juridica';
  toastMessage = signal<string | null>(null);
  arrayItems = signal<DocConfig[]>([]);
  form: FormGroup;

  // --- Overlay UI ---
  overlayOpen = false;
  overlayTitle = '';
  overlaySubtitle: string | null = null;

  constructor() {
    // Inicializamos con grupos vacíos para evitar errores de "undefined" en el HTML
    this.form = this.fb.group({
      step2_docs: this.fb.group({}),
      step3_data: this.fb.group({
        businessName: ['', Validators.required],
        nit: ['', Validators.required],
        legalRepName: ['', Validators.required],
        riskOption: ['NA', Validators.required],
        riskWhich: ['']
      })
    });
  }

  ngOnInit() {
      this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        // 1. El paso por defecto sigue siendo 1, pero ahora 1 es "Documentos"
        this.currentStep = Number(params['step']) || 1;
        this.isManualMode = params['mode'] === 'manual';

        // 2. Transformamos el 'co' de la URL a 'Colombia'
        // (Ajusta esto si tu COUNTRY_CONFIG usa las siglas en vez del nombre completo)
        const countryParam = params['country'];
        if (countryParam === 'co') {
          this.countrySelected = 'Colombia';
        } else {
          this.countrySelected = countryParam || undefined;
        }

        // 3. Reseteamos si no hay país
        if (!this.countrySelected) {
          this.arrayItems.set([]);
        }

        // 4. 🔥 LA CLAVE: Cambiamos currentStep === 2 por currentStep === 1
        if (this.currentStep === 1 && this.countrySelected) {
          const config = COUNTRY_CONFIG[this.countrySelected] || [];
          this.arrayItems.set(config);
          this.rebuildStep2Docs(config);
        }
      });
  }

  mostrarToast(mensaje: string) {
    this.toastMessage.set(mensaje);
    // Se oculta solo después de 3 segundos
    setTimeout(() => this.toastMessage.set(null), 3000);
  }

  // --- Validador de archivos ---
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
    config.forEach(doc => {
      group[doc.key] = [null];
    });

    this.form.setControl('step2_docs', this.fb.group(group, {
      validators: [this.atLeastOneFileValidator()]
    }));
  }

  // --- Navegación ---
  onCountryChange(event: Event) {
    const element = event.target as HTMLSelectElement;
    const country = element.value;

    if (!country) return;
    // Navegación absoluta para limpiar la URL de residuos anteriores
    this.router.navigate(['/provider'], { // Asegúrate de poner la ruta exacta de tu componente
      queryParams: {
        step: 1,
        country: country
      },
      // Esto evita que al darle "atrás" el usuario pase por todos los países que seleccionó antes
      replaceUrl: true
    });

    // Reset total de estados internos
    this.arrayItems.set([]);
    this.form.get('step2_docs')?.reset();
  }

  goToStep(step: number) {
    // Validación de seguridad para pasar al paso 3
    if (this.currentStep === 2 && step === 3) {
      const docsGroup = this.form.get('step2_docs');
      if (docsGroup?.invalid) {
        docsGroup.markAllAsTouched();
        return;
      }
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { step: step },
      queryParamsHandling: 'merge'
    });
  }

  irARegistroManual() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { step: 3, mode: 'manual', country: 'Otro' },
      queryParamsHandling: 'merge'
    });
  }
    prevStep() {
      if (this.currentStep === 2 || (this.currentStep === 3 && this.isManualMode)) {
        // Volvemos a la ruta base y ELIMINAMOS todos los queryParams
        this.router.navigate(['/provider'], {
          queryParams: {}, // Objeto vacío para limpiar la URL
          replaceUrl: true  // Opcional: para que no pueda volver al país anterior con el botón del navegador
        });

        // Limpiamos el estado interno manualmente por seguridad
        this.countrySelected = undefined;
        this.isManualMode = false;
        this.arrayItems.set([]);
        this.form.get('step2_docs')?.reset();
      } else if (this.currentStep > 1) {
        // Para los demás pasos (del 4 al 3, o del 3 al 2), navegación normal
        this.goToStep(this.currentStep - 1);
      }
    }
  // --- Manejo de archivos y API ---
    onFileSelected(event: Event, docKey: string) {
      const input = event.target as HTMLInputElement;
      if (input.files && input.files.length > 0) {
        const file = input.files[0];
        // Tu lógica original intacta
        this.form.get(`step2_docs.${docKey}`)?.setValue(file);
        this.form.get('step2_docs')?.updateValueAndValidity();
      }
    }

    removeFile(docKey: string) {
      // 1. Limpiamos el valor en el form control
      this.form.get(`step2_docs.${docKey}`)?.setValue(null);
      this.form.get('step2_docs')?.updateValueAndValidity();

      // 2. Limpiar el input físico para poder re-subir el mismo archivo si se desea
      const fileInput = document.getElementById('file-' + docKey) as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }
    }

  procesarPdf(docKey: string) {
    const file = this.form.get(`step2_docs.${docKey}`)?.value;
    if (!(file instanceof File)) return;

    this.overlayOpen = true;
    this.overlayTitle = 'Analizando ' + docKey.toUpperCase();

    const fd = new FormData();
    fd.append('file', file);
    fd.append('docType', docKey);

    this.services.startExtraction(file, docKey)
      .subscribe({
        next: (data) => {
          console.log("Datos extraídos con éxito:", data);
          this.form.get('step3_data')?.patchValue({
            businessName: data.nombres || '',
            nit: data.numeroDocumento || ''
          });

          this.overlayOpen = false;
        const jobId = data.jobId;
          if (jobId) {
              this.overlayTitle = 'Analizando documento...';
              // 2. Iniciamos el ciclo de preguntas al servidor
              this.verificarEstado(jobId);
            } else {
              this.overlayTitle = 'Error: No se recibió un número de ticket (jobId)';
              setTimeout(() => this.overlayOpen = false, 3000);
            }
        },
        error: (err) => {
          console.error("Error al extraer PDF:", err);
          this.overlayTitle = 'Error en extracción';
          setTimeout(() => this.overlayOpen = false, 2000);
        }
      });
  }

  verificarEstado(jobId: string) {
    this.services.checkStatus(jobId).subscribe({
      // Usamos 'any' para evitar que TypeScript marque error con la estructura dinámica
      next: (statusRes: any) => {
        console.log("⏳ Estado actual del análisis:", statusRes);

        // Convertimos a minúsculas por seguridad, ya que el Swagger dice "completed"
        const estado = statusRes.status?.toLowerCase();

        if (estado === 'pending' || estado === 'processing' || estado === 'in_progress') {
           // Si AWS sigue leyendo el PDF, esperamos 3 segundos y volvemos a preguntar
           console.log("AWS sigue procesando, reintentando en 3 segundos...");
           setTimeout(() => {
             this.verificarEstado(jobId);
           }, 3000);

        } else if (estado === 'completed' || estado === 'success') {
           // ¡Terminó de leer el documento!
           console.log("🎉 ¡Datos extraídos!");

           // 🌟 Navegamos por el JSON anidado exactamente como lo dicta tu Swagger
           const fields = statusRes.result?.resultsByPage?.[0]?.fields || [];

           // Buscamos el campo que contiene la palabra "NIT" (ej: "5. Número de Identificación Tributaria (NIT)")
           const nitField = fields.find((f: any) => f.field && f.field.includes('NIT'));

           // Buscamos el nombre (en el RUT de Colombia suele ser "Razón social" o "Apellidos y Nombres")
           const nameField = fields.find((f: any) => f.field &&
             (f.field.includes('Razón social') || f.field.toLowerCase().includes('nombres'))
           );

           // Llenamos los campos del formulario con los valores extraídos ("value")
           this.form.get('step3_data')?.patchValue({
             businessName: nameField ? nameField.value : '',
             nit: nitField ? nitField.value : ''
           });

           this.overlayOpen = false; // Cerramos la pantalla de carga

        } else {
           // Si el estado es 'failed' o devuelve un error de lectura
           this.overlayTitle = 'No se pudo leer el documento';
           setTimeout(() => this.overlayOpen = false, 3000);
        }
      },
      error: (err: any) => {
        console.error("❌ Error al verificar estado:", err);
        this.overlayTitle = 'Error consultando el estado';
        setTimeout(() => this.overlayOpen = false, 3000);
      }
    });
  }
  onOverlayClose() {
    this.overlayOpen = false;
  }

    submitForm() {
      if (this.form.invalid) {
        this.form.markAllAsTouched(); // Esto pinta los campos de rojo automáticamente

        // 🌟 Reemplazamos el alert() por nuestro nuevo Toast
        this.mostrarToast('Por favor completa los campos en rojo antes de continuar.');
        return;
    }

    // Estructuramos el objeto final combinando los datos de los grupos
    const finalData = {
      pais: this.countrySelected,
      modo: this.isManualMode ? 'Manual' : 'Asistido',
      documentos: this.form.get('step2_docs')?.value,
      informacion: this.form.get('step3_data')?.value
    };

    console.log('Formulario enviado con éxito:', finalData);

    // Aquí llamarías a tu servicio final de guardado
    this.overlayOpen = true;
    this.overlayTitle = 'Guardando registro...';

    // Simulación de guardado
    setTimeout(() => {
      this.overlayOpen = false;
      alert('Registro completado con éxito.');
      this.router.navigate(['/']); // Redirigir al inicio o dashboard
    }, 2000);
  }
}
