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
  .controller('HolidaysController', ['$scope', '$http', 'UtilService', function($scope, $http, UtilService) {

    $scope.days = 0;
    $scope.title = "cargando...";
    $scope.date = "cargando...";
    $scope.holidays = [];
    $scope.current_holiday = 0;
        
    var now = new Date();

    $http
      .get('holidays.json')
      .then(
        function(res) {
          var ok = false;

          $scope.holidays = res.data.data;

          res.data.data.forEach(function(holiday, index) {
            var date = new Date(holiday.date);

            if (
                ok == false
                && date.getFullYear() >= now.getFullYear() 
                && date.getMonth() >= now.getMonth() 
                && date.getDate() >= now.getDate()) 
            {
              $scope.render(index);
              ok = true;
            }
          });
        },
        function() {
          $scope.days = 0;
          $scope.title = "Error";
          $scope.date = "Recargue el sitio";
        });

      

      $scope.render = function(index) {
        if (typeof $scope.holidays[index] !== "undefined") {
          var holiday = $scope.holidays[index];
          $scope.days = UtilService.days_diff(now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate(), holiday.date);
          $scope.title = holiday.title;
          $scope.date = UtilService.fulldate(holiday.date);
          $scope.current_holiday = index;
        }
      }

      $scope.next_holiday = function() {
        $scope.render($scope.current_holiday + 1);
      }

      $scope.previous_holiday = function() {
        $scope.render($scope.current_holiday - 1);
      }

  }]);