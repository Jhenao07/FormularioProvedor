import { ChangeDetectionStrategy, Component } from '@angular/core';
import { services } from '../app/services';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-invited',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './invited.components.html',
  styleUrls: ['./invited.css'],
})
export class InvitedComponent {

  data: any = null;

  constructor(private dataService: services) {}

  ngOnInit() {
    this.data = this.dataService.getData();
    console.log('Datos recibidos:', this.data);
  }

 }
