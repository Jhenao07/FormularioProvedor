import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RegisterproviderComponent } from './registerprovider.component';

describe('RegisterproviderComponent', () => {
  let component: RegisterproviderComponent;
  let fixture: ComponentFixture<RegisterproviderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegisterproviderComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RegisterproviderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
