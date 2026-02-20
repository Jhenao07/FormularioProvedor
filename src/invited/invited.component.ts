import { Component, DestroyRef, inject, signal } from '@angular/core';
import { services } from '../app/services';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-invited',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './invited.components.html',
  styleUrls: ['./invited.css'],
})
export class InvitedComponent {
  linkFinal: string = '';
  data: any = null;
  linkCopiado: boolean = false;
  toastMessage = signal<string | null>(null);
  private destroyRef = inject(DestroyRef);

  constructor(private dataService: services, private router: Router, private route: ActivatedRoute, private services:services) {}




  ngOnInit() {
    this.generarEnlace();
    this.data = this.dataService.getData();
    console.log('Datos recibidos:', this.data);
  }
    generarEnlace() {
        const params = this.route.snapshot.queryParams;
        const urlTree = this.router.createUrlTree(['/register-provider'], { queryParams: params });
        this.linkFinal = window.location.origin + this.router.serializeUrl(urlTree);
      }

    copiarLink() {
    // Verificamos que sí exista un link para copiar
    if (this.linkFinal) {
      navigator.clipboard.writeText(this.linkFinal).then(() => {
        console.log('✅ ¡Enlace copiado al portapapeles!');

        // Cambiamos el estado para que el botón diga "¡Copiado!"
        this.linkCopiado = true;

        // Si tienes tu función de Toasts, la puedes llamar aquí también:
        // this.mostrarToast('¡Enlace copiado con éxito!');

        // Devolvemos el botón a la normalidad después de 2 segundos
        setTimeout(() => {
          this.linkCopiado = false;
        }, 2000);

      }).catch(err => {
        console.error('❌ Error al copiar al portapapeles:', err);
      });
    }
  }
  irARegistro() {
    const params = this.route.snapshot.queryParams;
    const oc = params['oc'];
    const os = params['os'];
    const sn = (params['sn'] || params['country'] || 'CO').toUpperCase();

    if (!oc || !os) {
      this.mostrarToast('Faltan IDs de la orden en la invitación');
      return;
    }

    this.router.navigate(['/register-provider'], {
      queryParams: { oc, os, sn }
    });

   
  }

  mostrarToast(mensaje: string) {
  this.toastMessage.set(mensaje);

  setTimeout(() => {
    this.toastMessage.set(null);
  }, 4000);
}

}
