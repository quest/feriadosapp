angular
  .module('holidays', [])
  .service('UtilService', function() {
    
    this.days_diff = function(now, date) {
      var date1 = new Date(date + ' GMT -0300'),
          date2 = new Date(now + ' GMT -0300'),
          timeDiff = Math.abs(date2.getTime() - date1.getTime()),
          diffDays = Math.ceil(timeDiff / (1000 * 3600 * 24)); 

      return diffDays;
    }

    this.fulldate = function(date) {
      // return date;
      var date = new Date(date + ' GMT -0300'),
          monthNames = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 
            'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
          ],
          dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sabado'];

        return dayNames[date.getDay()] + ' ' + date.getDate() + ' de ' + monthNames[date.getMonth()];

    }

  })
  .controller('HolidaysController', ['$http', 'UtilService', function($http, UtilService) {
    var now = new Date(),
        vm = this;

    vm.days = 0;
    vm.title = "cargando...";
    vm.date = "cargando...";
    vm.holidays = [];
    vm.current_holiday = 0;

    $http
      .get('holidays.json')
      .then(
        function(res) {
          var ok = false;

          vm.holidays = res.data.data;

          res.data.data.forEach(function(holiday, index) {
            var date = new Date(holiday.date);

            if (
                ok == false
                && date.getFullYear() >= now.getFullYear() 
                && date.getMonth() >= now.getMonth() 
                && date.getDate() >= now.getDate()) 
            {
              render(index);
              ok = true;
            }
          });
        },
        function() {
          vm.days = 0;
          vm.title = "Error";
          vm.date = "Recargue el sitio";
        });

      

      function render(index) {
        if (typeof vm.holidays[index] !== "undefined") {
          var holiday = vm.holidays[index];

          vm.days = UtilService.days_diff(now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate(), holiday.date);
          vm.title = holiday.title;
          vm.date = UtilService.fulldate(holiday.date);
          vm.current_holiday = index;
        }
      }

      vm.next_holiday = function() {
        render(vm.current_holiday + 1);
      }

      vm.previous_holiday = function() {
        render(vm.current_holiday - 1);
      }

  }]);