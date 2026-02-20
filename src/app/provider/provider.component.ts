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
        // 1. El paso por defecto
        this.currentStep = Number(params['step']) || 1;
        this.isManualMode = params['mode'] === 'manual';

        // 🚀 2. LEEMOS EL NUEVO PARÁMETRO 'sn'
        const snParam = params['sn']?.toUpperCase();

        // 🗺️ 3. DICCIONARIO PRO: Traducimos el código ISO al nombre completo de tu configuración
        const diccionariPaises: Record<string, string> = {
          'CO': 'Colombia',
          'US': 'Estados Unidos', // o 'USA' dependiendo de cómo lo mandes
          'MX': 'México',
          'ES': 'España',
          'DE': 'Alemania'
        };

        // Si viene un código válido, asignamos el nombre completo. Si no, es 'Otro'
        if (snParam && diccionariPaises[snParam]) {
          this.countrySelected = diccionariPaises[snParam];
        } else {
          this.countrySelected = 'Otro';
        }

        // 4. Reseteamos los documentos si es 'Otro' o no hay país
        if (!this.countrySelected || this.countrySelected === 'Otro') {
          this.arrayItems.set([]);
        }

        // 5. 🔥 LA MAGIA: Llenamos los documentos usando el nombre mapeado
        if (this.currentStep === 1 && this.countrySelected && this.countrySelected !== 'Otro') {
          const config = COUNTRY_CONFIG[this.countrySelected] || [];

          // Llenamos la señal visual (HTML)
          this.arrayItems.set(config);

          // Construimos el formulario reactivo dinámicamente
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
    this.overlayTitle = 'Enviando documento a AWS...';

    const fd = new FormData();
    fd.append('file', file);
    // 🚀 OBLIGATORIO SEGÚN SWAGGER:
    fd.append('render', JSON.stringify({ "dpi": 200, "pages": "1" }));

    this.services.startExtraction(file, docKey).subscribe({
      next: (data) => {
        const jobId = data.jobId;
        if (jobId) {
          console.log(`🎫 Ticket recibido: ${jobId}. Iniciando consultas automáticas...`);
          // Arrancamos el ciclo automático de 5 segundos
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
        // Leemos el estado y el progreso que manda AWS
        const estado = res.status ? res.status.toLowerCase() : '';
        const progreso = res.progress || 0;

        console.log(`⏳ AWS Responde - Estado: ${estado} | Progreso: ${progreso}%`);

        // Actualizamos la UI para que el usuario vea el % avanzando
        this.overlayTitle = `Analizando documento (${progreso}%)...`;

        if (estado === 'completed' || progreso === 100) {
          // 🎉 ¡Terminó con éxito!
          console.log("✅ ¡Datos listos!", res);
          this.extraerDatosDelJSON(res);

        } else if (estado === 'failed' || estado === 'error') {
          // ❌ Hubo un error procesando en AWS
          this.overlayTitle = 'Error leyendo el documento en AWS';
          setTimeout(() => this.overlayOpen = false, 3000);

        } else {
          // 🔄 Aún no termina (not_found, in_progress, pending). Esperamos 5 segundos.
          setTimeout(() => {
            this.iniciarPolling(jobId);
          }, 5000); // 5000 ms = 5 segundos exactos
        }
      },
      error: (err: any) => {
        // Si AWS responde con un error HTTP 404 (NOT_FOUND) porque aún no crea el ticket,
        // no nos rendimos. Seguimos intentando en 5 segundos.
        console.warn("⚠️ AWS no encontró el ticket aún. Reintentando en 5 segundos...");
        setTimeout(() => {
          this.iniciarPolling(jobId);
        }, 5000);
      }
    });
  }

  extraerDatosDelJSON(statusRes: any) {
    console.log("=======================================");
    console.log("🚀 INICIANDO EXTRACCIÓN MASIVA PRO");
    console.log("=======================================");

    const fields = statusRes.result?.resultsByPage?.[0]?.fields || [];

    // 🌟 1. IMPRIMIR TODOS LOS DATOS (Tu petición) 🌟
    console.log(`📑 Total de campos encontrados: ${fields.length}`);
    console.log("--- LISTA COMPLETA DE DATOS EXTRAÍDOS ---");

    fields.forEach((item: any) => {
      if (item.field) {
        // Imprime en consola: 🔹 [Nombre del Campo]: valor
        console.log(`🔹 [${item.field}]: ${item.value}`);
      }
    });
    console.log("-----------------------------------------");

    // 🛡️ 2. BÚSQUEDA BLINDADA (A prueba de fallos y tildes)

    // Buscamos el NIT convirtiendo a minúsculas
    const nitField = fields.find((f: any) =>
      f.field && f.field.toLowerCase().includes('nit')
    );

    // Buscamos la Razón Social abarcando todas las posibilidades
    const nameField = fields.find((f: any) => {
      if (!f.field) return false;
      const nombreCampo = f.field.toLowerCase();

      // Atrapamos "razón social" (con tilde), "razon social" (sin tilde), o "nombres"
      return nombreCampo.includes('razón social') ||
             nombreCampo.includes('razon social') ||
             nombreCampo.includes('nombres');
    });

    // Extraemos el valor asegurándonos de que no sea null
    const nitExtraido = nitField?.value ? nitField.value : '';
    const nombreExtraido = nameField?.value ? nameField.value : '';

    console.log("🎯 DATOS LISTOS PARA EL FORMULARIO:");
    console.log(`   ➡️ NIT a guardar: ${nitExtraido}`);
    console.log(`   ➡️ Razón Social a guardar: ${nombreExtraido}`);

    // 3. Inyectamos los datos limpios en tu formulario reactivo
    this.form.get('step3_data')?.patchValue({
      businessName: nombreExtraido,
      nit: nitExtraido
    });

    // 4. Cerramos el modal
    this.overlayTitle = '¡Análisis completado con éxito!';
    setTimeout(() => this.overlayOpen = false, 1500);
  }

  verificarEstado(jobId: string) {
    this.services.checkStatus(jobId).subscribe({
      next: (statusRes: any) => {
        console.log("⏳ Estado actual del análisis:", statusRes);

        // Convertimos a MAYÚSCULAS para que no haya problemas si AWS lo manda en minúsculas
        const estado = statusRes.status?.toUpperCase();

        // 🛡️ ESCUDO: Agregamos NOT_FOUND a la lista de "sigue intentando"
        if (estado === 'PENDING' || estado === 'IN_PROGRESS' || estado === 'PROCESSING' || estado === 'NOT_FOUND') {

           console.log(`AWS dice: ${estado}, reintentando en 3 segundos...`);
           setTimeout(() => {
             this.verificarEstado(jobId);
           }, 3000);

        } else if (estado === 'COMPLETED' || estado === 'SUCCESS') {
           console.log("🎉 ¡Datos extraídos exitosamente!", statusRes);

           // 🌟 Navegamos por el JSON (Asegúrate de que esta ruta sea igual a tu Swagger)
           const fields = statusRes.result?.resultsByPage?.[0]?.fields || [];

           const nitField = fields.find((f: any) => f.field && f.field.includes('NIT'));
           const nameField = fields.find((f: any) => f.field &&
             (f.field.includes('Razón social') || f.field.toLowerCase().includes('nombres'))
           );

           this.form.get('step3_data')?.patchValue({
             businessName: nameField ? nameField.value : '',
             nit: nitField ? nitField.value : ''
           });

           this.overlayTitle = '¡Análisis completado!';
           setTimeout(() => this.overlayOpen = false, 1000);

        } else {
           // Si llega FAILED u otra cosa
           this.overlayTitle = 'Error en la lectura del documento';
           console.error('Estado desconocido o fallido:', statusRes);
           setTimeout(() => this.overlayOpen = false, 3000);
        }
      },
      error: (err: any) => {
        console.error("❌ Error al consultar el estado:", err);
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
