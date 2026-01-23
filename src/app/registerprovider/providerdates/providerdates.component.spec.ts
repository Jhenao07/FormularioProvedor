import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProviderdatesComponent } from './providerdates.component';

describe('ProviderdatesComponent', () => {
  let component: ProviderdatesComponent;
  let fixture: ComponentFixture<ProviderdatesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProviderdatesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProviderdatesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
