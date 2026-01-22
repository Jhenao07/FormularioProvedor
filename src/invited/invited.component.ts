import { ChangeDetectionStrategy, Component } from '@angular/core';
import { services } from '../app/services';

@Component({
  selector: 'app-invited',
  imports: [],
  templateUrl: './invited.components.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvitedComponent {

  datos: any = null;

  constructor(private dataService: services) {}

  ngOnInit() {
    this.datos = this.dataService.getData();
    console.log('Datos recibidos:', this.datos);
  }

 }
